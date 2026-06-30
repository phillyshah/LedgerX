-- ============================================================
-- Migration: Network estimate visibility + billing type field
-- Date: 2026-07-03  (v10.7)
-- ============================================================
--
-- Two changes:
--
-- 1. **Network visibility**: any authenticated user who shares at
--    least one household with the estimate creator can now see that
--    estimate (plus its attachments and messages). This lets property
--    members view estimates from contractors working on their properties
--    without needing admin access. Network viewers are read-only — they
--    can see and mark-read, but cannot post messages or change status.
--
-- 2. **Billing type**: a required field indicating whether the estimate
--    covers the total bill or labour only (with materials billed
--    separately). Existing rows default to 'total'.

-- ─── 1. billing_type column ──────────────────────────────────────────────────
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'total'
  CHECK (billing_type IN ('total', 'labor_only'));

-- ─── 2. Network SELECT policy — estimates ────────────────────────────────────
DROP POLICY IF EXISTS "Network members view estimates" ON estimates;
CREATE POLICY "Network members view estimates"
  ON estimates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm1
      JOIN household_members hm2 ON hm1.household_id = hm2.household_id
      WHERE hm1.user_id = auth.uid()
        AND hm2.user_id = estimates.created_by
        AND hm1.user_id <> hm2.user_id
    )
  );

-- ─── 3. Network SELECT policy — estimate_attachments ─────────────────────────
DROP POLICY IF EXISTS "Network members view estimate attachments" ON estimate_attachments;
CREATE POLICY "Network members view estimate attachments"
  ON estimate_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM estimates e
      JOIN household_members hm1 ON hm1.user_id = auth.uid()
      JOIN household_members hm2 ON hm2.user_id = e.created_by
        AND hm1.household_id = hm2.household_id
      WHERE e.id = estimate_attachments.estimate_id
        AND hm1.user_id <> hm2.user_id
    )
  );

-- ─── 4. Network SELECT policy — estimate_messages ────────────────────────────
DROP POLICY IF EXISTS "Network members view estimate messages" ON estimate_messages;
CREATE POLICY "Network members view estimate messages"
  ON estimate_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM estimates e
      JOIN household_members hm1 ON hm1.user_id = auth.uid()
      JOIN household_members hm2 ON hm2.user_id = e.created_by
        AND hm1.household_id = hm2.household_id
      WHERE e.id = estimate_messages.estimate_id
        AND hm1.user_id <> hm2.user_id
    )
  );

-- ─── 5. list_visible_estimates() — replaces raw SELECT in frontend ───────────
-- Returns estimates the caller can see, with submitter username and household
-- name pre-resolved. Covers: own, admin-sees-all, and network membership.
CREATE OR REPLACE FUNCTION list_visible_estimates()
RETURNS TABLE (
  id uuid,
  created_by uuid,
  household_id uuid,
  title text,
  description text,
  status text,
  billing_type text,
  admin_notes text,
  file_path text,
  file_mime text,
  created_at timestamptz,
  updated_at timestamptz,
  submitter_username text,
  household_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
  SELECT
    e.id, e.created_by, e.household_id, e.title, e.description,
    e.status, e.billing_type, e.admin_notes, e.file_path, e.file_mime,
    e.created_at, e.updated_at,
    COALESCE(up.username, split_part(u.email, '@', 1), 'user') AS submitter_username,
    COALESCE(h.name, '') AS household_name
  FROM estimates e
  LEFT JOIN user_profiles up ON up.id = e.created_by
  LEFT JOIN auth.users u ON u.id = e.created_by
  LEFT JOIN households h ON h.id = e.household_id
  WHERE
    is_admin()
    OR e.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM household_members hm1
      JOIN household_members hm2 ON hm1.household_id = hm2.household_id
      WHERE hm1.user_id = auth.uid() AND hm2.user_id = e.created_by
        AND hm1.user_id <> hm2.user_id
    )
  ORDER BY e.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_visible_estimates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_visible_estimates() TO authenticated;

-- ─── 6. Update mark_estimate_read — allow network members ───────────────────
CREATE OR REPLACE FUNCTION mark_estimate_read(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM estimates e
    WHERE e.id = p_estimate_id
      AND (
        is_admin()
        OR e.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM household_members hm1
          JOIN household_members hm2 ON hm1.household_id = hm2.household_id
          WHERE hm1.user_id = auth.uid() AND hm2.user_id = e.created_by
            AND hm1.user_id <> hm2.user_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO estimate_reads (estimate_id, user_id, last_read_at)
  VALUES (p_estimate_id, auth.uid(), now())
  ON CONFLICT (estimate_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$;

-- ─── 7. Update list_estimate_unread — include network estimates ──────────────
CREATE OR REPLACE FUNCTION list_estimate_unread()
RETURNS TABLE (estimate_id uuid, unread_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT m.estimate_id, COUNT(*)::bigint
  FROM estimate_messages m
  JOIN estimates e ON e.id = m.estimate_id
  LEFT JOIN estimate_reads r
    ON r.estimate_id = m.estimate_id AND r.user_id = auth.uid()
  WHERE (
      is_admin()
      OR e.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM household_members hm1
        JOIN household_members hm2 ON hm1.household_id = hm2.household_id
        WHERE hm1.user_id = auth.uid() AND hm2.user_id = e.created_by
          AND hm1.user_id <> hm2.user_id
      )
    )
    AND m.sender_id <> auth.uid()
    AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
  GROUP BY m.estimate_id;
$$;

-- ─── 8. Update list_estimate_messages — allow network members ────────────────
CREATE OR REPLACE FUNCTION list_estimate_messages(p_estimate_id uuid)
RETURNS TABLE (
  id              uuid,
  estimate_id     uuid,
  sender_id       uuid,
  sender_username text,
  body            text,
  created_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
  SELECT
    m.id,
    m.estimate_id,
    m.sender_id,
    COALESCE(up.username, split_part(u.email, '@', 1), 'user') AS sender_username,
    m.body,
    m.created_at
  FROM estimate_messages m
  JOIN estimates e ON e.id = m.estimate_id
  LEFT JOIN user_profiles up ON up.id = m.sender_id
  LEFT JOIN auth.users u ON u.id = m.sender_id
  WHERE m.estimate_id = p_estimate_id
    AND (
      is_admin()
      OR e.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM household_members hm1
        JOIN household_members hm2 ON hm1.household_id = hm2.household_id
        WHERE hm1.user_id = auth.uid() AND hm2.user_id = e.created_by
          AND hm1.user_id <> hm2.user_id
      )
    )
  ORDER BY m.created_at ASC;
$$;

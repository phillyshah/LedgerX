-- ============================================================
-- Migration: Contractor estimates + per-estimate chat
-- Date: 2026-07-01  (v10.5)
-- ============================================================
--
-- Contractors submit estimates (JPEG/PDF) the same way they submit
-- invoices: files land in the private `receipts` bucket (signed-URL
-- access only), the row is scoped to the submitter by RLS. New here:
--   * a per-estimate message thread (estimate_messages) so the admin and
--     the submitting contractor can have a back-and-forth;
--   * read-tracking (estimate_reads) powering unread badges in the lists.
--
-- Mirrors the contractor_invoices stack (20260423000000): same helper
-- functions (is_admin / is_contractor / user_households), same
-- SECURITY-DEFINER-RPC-for-admin-mutations convention, same attachment
-- shape as invoice_images. Retention: only a full admin can delete an
-- estimate (cascades attachments + messages); nothing auto-cleans files.

-- ─── 1. estimates ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimates (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid          NOT NULL REFERENCES auth.users(id),
  household_id  uuid          REFERENCES households(id) ON DELETE SET NULL,
  title         text          NOT NULL,
  description   text,
  status        text          NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'accepted', 'rejected')),
  admin_notes   text,
  -- legacy single-attachment slot (mirrors contractor_invoices) so the
  -- dual-write pattern stays identical to invoices.
  file_path     text,
  file_mime     text,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimates_created_by_idx   ON estimates(created_by);
CREATE INDEX IF NOT EXISTS estimates_household_id_idx ON estimates(household_id);
CREATE INDEX IF NOT EXISTS estimates_status_idx       ON estimates(status);

-- set_updated_at() already exists (created with contractor_invoices);
-- CREATE OR REPLACE is a no-op safety net if migrations run out of order.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_updated_at ON estimates;
CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 2. estimate_attachments (mirrors invoice_images) ────────────────────────
CREATE TABLE IF NOT EXISTS estimate_attachments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id    uuid        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  file_path      text        NOT NULL,
  file_mime      text,
  file_width     integer,
  file_height    integer,
  display_order  integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_attachments_estimate_id_idx
  ON estimate_attachments(estimate_id);

-- ─── 3. estimate_messages (the chat thread) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id  uuid        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  sender_id    uuid        NOT NULL REFERENCES auth.users(id),
  body         text        NOT NULL CHECK (length(btrim(body)) > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_messages_estimate_created_idx
  ON estimate_messages(estimate_id, created_at);

-- ─── 4. estimate_reads (per-user last-read pointer → unread badges) ───────────
CREATE TABLE IF NOT EXISTS estimate_reads (
  estimate_id  uuid        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (estimate_id, user_id)
);

-- ─── 5. RLS — estimates ──────────────────────────────────────────────────────
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractors insert own estimates" ON estimates;
CREATE POLICY "Contractors insert own estimates"
  ON estimates FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND is_contractor()
    AND (household_id IS NULL OR household_id IN (SELECT user_households()))
  );

DROP POLICY IF EXISTS "Contractors view own estimates" ON estimates;
CREATE POLICY "Contractors view own estimates"
  ON estimates FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Admins view all estimates" ON estimates;
CREATE POLICY "Admins view all estimates"
  ON estimates FOR SELECT
  USING (is_admin());

-- Retention rule: only a full admin can delete an estimate. Contractors
-- get NO delete policy, so their files persist until the admin acts.
DROP POLICY IF EXISTS "Admins delete any estimate" ON estimates;
CREATE POLICY "Admins delete any estimate"
  ON estimates FOR DELETE
  USING (is_admin());
-- No UPDATE policy: status / notes changes go through the admin-only
-- SECURITY DEFINER RPC below (which bypasses RLS), matching the invoice
-- convention.

-- ─── 6. RLS — estimate_attachments (gate via parent) ─────────────────────────
ALTER TABLE estimate_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractors insert own estimate attachments" ON estimate_attachments;
CREATE POLICY "Contractors insert own estimate attachments"
  ON estimate_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_attachments.estimate_id
        AND e.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Contractors view own estimate attachments" ON estimate_attachments;
CREATE POLICY "Contractors view own estimate attachments"
  ON estimate_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_attachments.estimate_id
        AND e.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins view all estimate attachments" ON estimate_attachments;
CREATE POLICY "Admins view all estimate attachments"
  ON estimate_attachments FOR SELECT
  USING (is_admin());

-- ─── 7. RLS — estimate_messages (both parties read + post) ───────────────────
ALTER TABLE estimate_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants view estimate messages" ON estimate_messages;
CREATE POLICY "Participants view estimate messages"
  ON estimate_messages FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_messages.estimate_id
        AND e.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants post estimate messages" ON estimate_messages;
CREATE POLICY "Participants post estimate messages"
  ON estimate_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_messages.estimate_id
          AND e.created_by = auth.uid()
      )
    )
  );
-- Messages are immutable: no UPDATE/DELETE policies. Admin cleanup happens
-- via the estimate-delete cascade.

-- ─── 8. RLS — estimate_reads (access only via SECURITY DEFINER RPCs) ──────────
ALTER TABLE estimate_reads ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — clients never touch this table directly;
-- mark_estimate_read() / list_estimate_unread() (SECURITY DEFINER) own it.

-- ─── 9. Admin RPC: set estimate status ───────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_set_estimate_status(
  p_estimate_id uuid,
  p_status      text,
  p_admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_status NOT IN ('open', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  UPDATE estimates
  SET
    status      = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    updated_at  = now()
  WHERE id = p_estimate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_estimate_status(uuid, text, text) TO authenticated;

-- ─── 10. mark_estimate_read — stamp the caller's last-read pointer ────────────
CREATE OR REPLACE FUNCTION mark_estimate_read(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only allow marking estimates the caller can actually see.
  IF NOT EXISTS (
    SELECT 1 FROM estimates e
    WHERE e.id = p_estimate_id
      AND (is_admin() OR e.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO estimate_reads (estimate_id, user_id, last_read_at)
  VALUES (p_estimate_id, auth.uid(), now())
  ON CONFLICT (estimate_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION mark_estimate_read(uuid) TO authenticated;

-- ─── 11. list_estimate_unread — unread message counts for the caller ─────────
-- One row per estimate that has at least one unread message FROM THE OTHER
-- PARTY (sender <> caller, newer than the caller's last_read_at). Scoped to
-- estimates the caller may see.
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
  WHERE (is_admin() OR e.created_by = auth.uid())
    AND m.sender_id <> auth.uid()
    AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
  GROUP BY m.estimate_id;
$$;

GRANT EXECUTE ON FUNCTION list_estimate_unread() TO authenticated;

-- ─── 12. list_estimate_messages — thread with resolved sender usernames ──────
-- Returns the chat for one estimate, joining usernames so the contractor
-- (who can't call admin_list_users) still sees who said what. Never exposes
-- real emails — only the pre-@ username slug as a fallback.
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
    AND (is_admin() OR e.created_by = auth.uid())
  ORDER BY m.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION list_estimate_messages(uuid) TO authenticated;

-- ─── 13. Extend notification_log.kind for estimate submissions ───────────────
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_kind_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_kind_check
  CHECK (kind IN (
    'submission_invoice',
    'submission_expense',
    'submission_estimate',
    'inactivity_reminder'
  ));

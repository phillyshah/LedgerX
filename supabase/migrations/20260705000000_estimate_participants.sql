-- ============================================================
-- Migration: Estimate participants (v10.8)
-- Admins can invite any user into a specific estimate's chat.
-- ============================================================

-- ─── 1. New table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_participants (
  estimate_id  uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by   uuid NOT NULL REFERENCES auth.users(id),
  invited_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (estimate_id, user_id)
);

CREATE INDEX IF NOT EXISTS estimate_participants_user_idx
  ON estimate_participants(user_id);

-- No direct client access — all reads/writes go through SECURITY DEFINER RPCs.
ALTER TABLE estimate_participants ENABLE ROW LEVEL SECURITY;

-- ─── 2. RLS: invited participants can SELECT estimates ───────────────────────
DROP POLICY IF EXISTS "Invited participants view estimates" ON estimates;
CREATE POLICY "Invited participants view estimates"
  ON estimates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM estimate_participants ep
      WHERE ep.estimate_id = estimates.id AND ep.user_id = auth.uid()
    )
  );

-- ─── 3. RLS: invited participants can SELECT estimate_attachments ─────────────
DROP POLICY IF EXISTS "Invited participants view estimate attachments" ON estimate_attachments;
CREATE POLICY "Invited participants view estimate attachments"
  ON estimate_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM estimate_participants ep
      WHERE ep.estimate_id = estimate_attachments.estimate_id AND ep.user_id = auth.uid()
    )
  );

-- ─── 4. RLS: invited participants can SELECT estimate_messages ───────────────
DROP POLICY IF EXISTS "Invited participants view estimate messages" ON estimate_messages;
CREATE POLICY "Invited participants view estimate messages"
  ON estimate_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM estimate_participants ep
      WHERE ep.estimate_id = estimate_messages.estimate_id AND ep.user_id = auth.uid()
    )
  );

-- ─── 5. RLS: invited participants can INSERT estimate_messages ───────────────
DROP POLICY IF EXISTS "Participants post estimate messages" ON estimate_messages;
CREATE POLICY "Participants post estimate messages"
  ON estimate_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.id = estimate_messages.estimate_id AND e.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM estimate_participants ep
        WHERE ep.estimate_id = estimate_messages.estimate_id AND ep.user_id = auth.uid()
      )
    )
  );

-- ─── 6. invite_estimate_participant RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION invite_estimate_participant(
  p_estimate_id uuid,
  p_username    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT id INTO v_user_id
  FROM user_profiles
  WHERE username = p_username;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user not found: %', p_username;
  END IF;

  IF EXISTS (
    SELECT 1 FROM estimates WHERE id = p_estimate_id AND created_by = v_user_id
  ) THEN
    RAISE EXCEPTION 'user is already the estimate submitter';
  END IF;

  INSERT INTO estimate_participants (estimate_id, user_id, invited_by)
  VALUES (p_estimate_id, v_user_id, auth.uid())
  ON CONFLICT (estimate_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION invite_estimate_participant(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION invite_estimate_participant(uuid, text) TO authenticated;

-- ─── 7. list_estimate_participants RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION list_estimate_participants(p_estimate_id uuid)
RETURNS TABLE (
  user_id    uuid,
  username   text,
  invited_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
  SELECT
    ep.user_id,
    COALESCE(up.username, split_part(u.email, '@', 1), 'user') AS username,
    ep.invited_at
  FROM estimate_participants ep
  LEFT JOIN user_profiles up ON up.id = ep.user_id
  LEFT JOIN auth.users u ON u.id = ep.user_id
  WHERE ep.estimate_id = p_estimate_id
    AND is_admin()
  ORDER BY ep.invited_at ASC;
$$;

REVOKE ALL ON FUNCTION list_estimate_participants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_estimate_participants(uuid) TO authenticated;

-- ─── 8. Update list_visible_estimates — add is_participant column + OR branch ─
DROP FUNCTION IF EXISTS list_visible_estimates();
CREATE OR REPLACE FUNCTION list_visible_estimates()
RETURNS TABLE (
  id                 uuid,
  created_by         uuid,
  household_id       uuid,
  title              text,
  description        text,
  status             text,
  billing_type       text,
  admin_notes        text,
  file_path          text,
  file_mime          text,
  created_at         timestamptz,
  updated_at         timestamptz,
  submitter_username text,
  household_name     text,
  is_participant     boolean
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
    COALESCE(h.name, '') AS household_name,
    EXISTS (
      SELECT 1 FROM estimate_participants ep
      WHERE ep.estimate_id = e.id AND ep.user_id = auth.uid()
    ) AS is_participant
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
    OR EXISTS (
      SELECT 1 FROM estimate_participants ep
      WHERE ep.estimate_id = e.id AND ep.user_id = auth.uid()
    )
  ORDER BY e.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_visible_estimates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_visible_estimates() TO authenticated;

-- ─── 9. Update mark_estimate_read — allow participants ───────────────────────
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
        OR EXISTS (
          SELECT 1 FROM estimate_participants ep
          WHERE ep.estimate_id = e.id AND ep.user_id = auth.uid()
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

REVOKE ALL ON FUNCTION mark_estimate_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_estimate_read(uuid) TO authenticated;

-- ─── 10. Update list_estimate_unread — include participant estimates ──────────
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
      OR EXISTS (
        SELECT 1 FROM estimate_participants ep
        WHERE ep.estimate_id = m.estimate_id AND ep.user_id = auth.uid()
      )
    )
    AND m.sender_id <> auth.uid()
    AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
  GROUP BY m.estimate_id;
$$;

REVOKE ALL ON FUNCTION list_estimate_unread() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_estimate_unread() TO authenticated;

-- ─── 11. Update list_estimate_messages — allow participants ──────────────────
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
    m.id, m.estimate_id, m.sender_id,
    COALESCE(up.username, split_part(u.email, '@', 1), 'user') AS sender_username,
    m.body, m.created_at
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
      OR EXISTS (
        SELECT 1 FROM estimate_participants ep
        WHERE ep.estimate_id = m.estimate_id AND ep.user_id = auth.uid()
      )
    )
  ORDER BY m.created_at ASC;
$$;

REVOKE ALL ON FUNCTION list_estimate_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_estimate_messages(uuid) TO authenticated;

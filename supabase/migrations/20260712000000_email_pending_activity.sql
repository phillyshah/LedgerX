-- ============================================================
-- Migration: Email commands "pending" + "activity" (v11.8)
-- ============================================================
--
-- Two more service-role helpers for the email-command bot (subjects
-- "pending"/"todo" and "activity"), mirroring email_command_report
-- (20260708000000): each takes an explicit p_user_id, re-derives the role
-- from user_roles directly (auth.uid() is NULL under the service role), and
-- scopes household admins to their own households. Both are read-only.
--
--   * email_command_pending  — a "what needs attention" digest: invoices
--     awaiting approval, estimates open > 14 days, and (full admins only)
--     the count of uncategorized transactions.
--
--   * email_command_activity — a last-7-days pulse: new estimates / invoices
--     / receipts submitted in scope, plus how many members haven't signed in
--     for over 14 days.
--
-- Counts only — never real emails or usernames in the payload (CLAUDE.md).

-- ─── 1. email_command_pending ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION email_command_pending(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_admin boolean;
  v_ha    boolean;
  v_hh    uuid[];
BEGIN
  SELECT COALESCE(ur.is_admin, false), COALESCE(ur.is_household_admin, false)
    INTO v_admin, v_ha
  FROM user_roles ur
  WHERE ur.user_id = p_user_id;

  v_admin := COALESCE(v_admin, false);
  v_ha := COALESCE(v_ha, false);

  IF NOT (v_admin OR v_ha) THEN
    RETURN jsonb_build_object('role', 'member');
  END IF;

  IF v_ha AND NOT v_admin THEN
    SELECT COALESCE(array_agg(hm.household_id), '{}')
      INTO v_hh
    FROM household_members hm
    WHERE hm.user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'role', CASE WHEN v_admin THEN 'admin' ELSE 'household_admin' END,
    'invoices_pending', (
      SELECT count(*) FROM contractor_invoices i
      WHERE i.status = 'pending'
        AND (v_admin OR i.household_id = ANY (v_hh))
    ),
    'estimates_aging', (
      SELECT count(*) FROM estimates e
      WHERE e.status = 'open'
        AND e.created_at < now() - interval '14 days'
        AND (v_admin OR e.household_id = ANY (v_hh))
    ),
    -- Uncategorized transactions are a global, full-admin-only concern
    -- (mirrors admin_get_uncategorized_expenses: orphaned household OR a
    -- category that no longer resolves). Household admins get 0.
    'uncategorized', CASE WHEN v_admin THEN (
      SELECT count(*) FROM expenses e
      WHERE e.household_id IS NULL
        OR (
          e.category IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM categories c
            WHERE c.name = e.category
              AND (c.household_id IS NULL OR c.household_id = e.household_id)
          )
        )
    ) ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION email_command_pending(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_command_pending(uuid) TO service_role;

-- ─── 2. email_command_activity ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION email_command_activity(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_admin  boolean;
  v_ha     boolean;
  v_hh     uuid[];
  v_since  timestamptz := now() - interval '7 days';
BEGIN
  SELECT COALESCE(ur.is_admin, false), COALESCE(ur.is_household_admin, false)
    INTO v_admin, v_ha
  FROM user_roles ur
  WHERE ur.user_id = p_user_id;

  v_admin := COALESCE(v_admin, false);
  v_ha := COALESCE(v_ha, false);

  IF NOT (v_admin OR v_ha) THEN
    RETURN jsonb_build_object('role', 'member');
  END IF;

  IF v_ha AND NOT v_admin THEN
    SELECT COALESCE(array_agg(hm.household_id), '{}')
      INTO v_hh
    FROM household_members hm
    WHERE hm.user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'role', CASE WHEN v_admin THEN 'admin' ELSE 'household_admin' END,
    'new_estimates', (
      SELECT count(*) FROM estimates e
      WHERE e.created_at >= v_since
        AND (v_admin OR e.household_id = ANY (v_hh))
    ),
    'new_invoices', (
      SELECT count(*) FROM contractor_invoices i
      WHERE i.created_at >= v_since
        AND (v_admin OR i.household_id = ANY (v_hh))
    ),
    'new_expenses', (
      SELECT count(*) FROM expenses e
      WHERE e.created_at >= v_since
        AND (v_admin OR e.household_id = ANY (v_hh))
    ),
    -- Members in scope who haven't signed in for over 14 days (or never).
    -- Household admins only count their own non-admin members; the requester
    -- is always excluded.
    'inactive_members', (
      SELECT count(DISTINCT hm.user_id)
      FROM household_members hm
      JOIN auth.users au ON au.id = hm.user_id
      LEFT JOIN user_roles ur ON ur.user_id = hm.user_id
      WHERE (v_admin OR hm.household_id = ANY (v_hh))
        AND hm.user_id <> p_user_id
        AND (au.last_sign_in_at IS NULL OR au.last_sign_in_at < now() - interval '14 days')
        AND (
          v_admin
          OR (COALESCE(ur.is_admin, false) = false AND COALESCE(ur.is_household_admin, false) = false)
        )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION email_command_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_command_activity(uuid) TO service_role;

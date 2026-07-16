-- ============================================================
-- LedgerX Labs: scope household-admin candidates by creator role (v13.0)
-- ============================================================
--
-- Refinement to cross-household reconciliation (20260724000000). A HOUSEHOLD
-- admin matching statement lines should only see, as candidate receipts:
--   * their own submissions, and
--   * receipts submitted by regular users or contractors
-- They must NOT see receipts submitted by OTHER household admins or by a full
-- (super) admin. Full admins are unchanged — they still see everything.
--
-- Implemented as a creator-role filter applied in BOTH the candidate-list RPC
-- and can_act_on_expense() (so a household admin can't match an excluded
-- receipt via a direct RPC call either — the list and the permission stay in
-- lockstep).
--
-- "Visible creator" for a household admin = the receipt is their own OR the
-- creator is neither a full admin nor a household admin (i.e. a regular user
-- or contractor). Expressed as: created_by = auth.uid() OR NOT EXISTS a
-- user_roles row for the creator with is_admin or is_household_admin.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION list_reconciliation_candidates()
RETURNS TABLE (
  id             uuid,
  expense_date   date,
  vendor         text,
  total          numeric,
  currency       text,
  category       text,
  notes          text,
  transcript     text,
  household_id   uuid,
  household_name text,
  image_path     text,
  image_mime     text,
  image_width    integer,
  image_height   integer,
  created_by     uuid,
  submitter_username text,
  paid_at        timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    e.id, e.expense_date, e.vendor, e.total, e.currency, e.category, e.notes, e.transcript,
    e.household_id, h.name AS household_name,
    e.image_path, e.image_mime, e.image_width, e.image_height,
    e.created_by, up.username AS submitter_username, e.paid_at
  FROM expenses e
  JOIN households h ON h.id = e.household_id
  LEFT JOIN user_profiles up ON up.id = e.created_by
  WHERE is_labs_eligible('labs_cc_reconciliation')
    AND (
      is_admin()  -- full admin: every household, every submitter
      OR (
        COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
        AND (
          e.created_by = auth.uid()  -- own submissions
          OR NOT EXISTS (            -- or a regular user / contractor (not an admin/HA)
            SELECT 1 FROM user_roles r
            WHERE r.user_id = e.created_by
              AND (r.is_admin OR r.is_household_admin)
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION list_reconciliation_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_reconciliation_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION can_act_on_expense(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT is_admin() OR (
    is_labs_eligible('labs_cc_reconciliation') AND EXISTS (
      SELECT 1 FROM expenses e
      JOIN households h ON h.id = e.household_id
      WHERE e.id = p_expense_id
        AND COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
        AND (
          e.created_by = auth.uid()
          OR NOT EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.user_id = e.created_by
              AND (r.is_admin OR r.is_household_admin)
          )
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION can_act_on_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_act_on_expense(uuid) TO authenticated;

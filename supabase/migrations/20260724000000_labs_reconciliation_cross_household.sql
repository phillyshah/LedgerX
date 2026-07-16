-- ============================================================
-- LedgerX Labs: cross-household reconciliation candidates (v12.9)
-- ============================================================
--
-- A credit-card statement spans multiple properties, so reconciling it
-- means matching its line items to receipts across ALL participating
-- households — not just the ones the reconciling admin personally belongs
-- to. Product decision: ANY Labs-eligible admin (a full admin, or a
-- household admin of at least one Labs-flagged household) may match a
-- statement line to a receipt in ANY Labs-flagged property.
--
-- Two problems this fixes for the household-admin case:
--   1. The candidate pool was loaded with a plain `expenses` SELECT, which
--      RLS scopes to the caller's own households — so a household admin
--      never saw receipts in other properties. New SECURITY DEFINER RPC
--      list_reconciliation_candidates() returns the cross-household pool
--      (bypassing per-household RLS, gated on Labs-eligibility).
--   2. can_act_on_expense() required the household admin to be a MEMBER of
--      the expense's household. Loosened so a Labs-eligible admin can act
--      on any expense in a Labs-flagged household.
--
-- Full admins are unchanged in spirit (they already saw/could-act-on
-- everything); this only widens the household-admin case.
--
-- Safe to re-run.

-- ─── 1. Candidate pool RPC ───────────────────────────────────────────────────
-- Full admin → every household's expenses. Labs-eligible household admin →
-- every Labs-FLAGGED household's expenses (regardless of their own
-- membership). Household name + submitter username are resolved here (the
-- function is SECURITY DEFINER, so cross-household names/usernames the caller
-- couldn't SELECT directly still come back — the household tag stays accurate
-- for other properties).
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
  WHERE is_labs_eligible('labs_cc_reconciliation')       -- caller must be Labs-eligible at all
    AND (
      is_admin()                                          -- full admin: every household
      OR COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)  -- else: flagged households
    );
$$;

REVOKE ALL ON FUNCTION list_reconciliation_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_reconciliation_candidates() TO authenticated;

-- ─── 2. Loosen can_act_on_expense to any flagged household ───────────────────
-- Was: full admin, OR household admin who is a MEMBER of the expense's
-- (flagged) household. Now: full admin, OR any Labs-eligible admin acting on
-- an expense in a Labs-flagged household — membership in that specific
-- household is no longer required, matching the "any Labs admin across all
-- properties" decision.
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
    )
  );
$$;

REVOKE ALL ON FUNCTION can_act_on_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_act_on_expense(uuid) TO authenticated;

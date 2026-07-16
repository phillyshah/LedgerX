-- ============================================================
-- LedgerX Labs: restrict Credit Card Reconciliation to admins
-- and household admins only (v12.6)
-- ============================================================
--
-- 20260722000000 opened Labs visibility/matching to ANY non-contractor
-- household member. Product decision: narrow to full admins and household
-- admins only — regular members and contractors must never see or touch
-- this feature. Rewrites the 3 SELECT policies and can_act_on_expense()
-- (the single authorization gate behind all 3 matching RPCs) accordingly.
-- Tightening can_act_on_expense() matters as much as the SELECT policies:
-- without it, a regular member could still call match_statement_line_item
-- directly even with the UI/SELECT policies hiding Labs from them.
--
-- Safe to re-run.

-- Shared eligibility predicate, factored out so it isn't copy-pasted across
-- the 3 SELECT policies below (and so a future Labs experiment's policies
-- can reuse it with a different flag key) — same convention as this
-- codebase's other RLS helpers (is_admin(), is_contractor(), etc.).
CREATE OR REPLACE FUNCTION is_labs_eligible(p_flag text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT is_admin() OR (
    is_household_admin() AND EXISTS (
      SELECT 1 FROM households h
      WHERE h.id IN (SELECT user_households())
        AND COALESCE((h.features_enabled->>p_flag)::boolean, false)
    )
  );
$$;

REVOKE ALL ON FUNCTION is_labs_eligible(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_labs_eligible(text) TO authenticated;

DROP POLICY IF EXISTS "Labs-eligible members and admins view statements" ON credit_card_statements;
CREATE POLICY "Labs-eligible members and admins view statements"
  ON credit_card_statements FOR SELECT
  USING (is_labs_eligible('labs_cc_reconciliation'));

DROP POLICY IF EXISTS "Labs-eligible members and admins view line items" ON statement_line_items;
CREATE POLICY "Labs-eligible members and admins view line items"
  ON statement_line_items FOR SELECT
  USING (is_labs_eligible('labs_cc_reconciliation'));

DROP POLICY IF EXISTS "Labs-eligible members and admins read statement files" ON storage.objects;
CREATE POLICY "Labs-eligible members and admins read statement files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = 'statements'
    AND is_labs_eligible('labs_cc_reconciliation')
  );

-- can_act_on_expense() keeps its own shape rather than calling
-- is_labs_eligible(): it needs to check ONE specific household (the
-- expense's) plus creator-or-member, not "any flagged household the
-- caller belongs to" — a genuinely different predicate, not duplication.
CREATE OR REPLACE FUNCTION can_act_on_expense(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT is_admin() OR (
    is_household_admin() AND EXISTS (
      SELECT 1 FROM expenses e
      JOIN households h ON h.id = e.household_id
      WHERE e.id = p_expense_id
        AND COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
        AND (
          e.created_by = auth.uid()
          OR e.household_id IN (SELECT user_households())
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION can_act_on_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_act_on_expense(uuid) TO authenticated;

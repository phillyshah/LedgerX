-- ============================================================
-- LedgerX Labs: manually edit a statement line item (v13.2)
-- ============================================================
--
-- OCR on card statements is sometimes wrong (misread digits, garbled
-- merchant names). Line items have no client UPDATE policy at all today —
-- every mutation goes through a SECURITY DEFINER RPC (see 20260722000000).
-- This adds one more for fixing the raw OCR'd fields (date/description/
-- amount) after the fact.
--
-- Admin-only, same as every other statement-management action (upload,
-- rename, delete) — per the feature's "super admin" convention, this is
-- distinct from the member-gated match/unmatch RPCs which use
-- can_act_on_expense(). Editing a line item never touches matched_expense_id.

CREATE OR REPLACE FUNCTION admin_update_statement_line_item(
  p_line_item_id uuid,
  p_line_date    date,
  p_description  text,
  p_amount       numeric
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

  IF NOT EXISTS (SELECT 1 FROM statement_line_items WHERE id = p_line_item_id) THEN
    RAISE EXCEPTION 'line item not found';
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'amount must be >= 0';
  END IF;

  UPDATE statement_line_items
  SET
    line_date   = COALESCE(p_line_date, line_date),
    description = COALESCE(NULLIF(btrim(COALESCE(p_description, '')), ''), description),
    amount      = COALESCE(p_amount, amount)
  WHERE id = p_line_item_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_update_statement_line_item(uuid, date, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_statement_line_item(uuid, date, text, numeric) TO authenticated;

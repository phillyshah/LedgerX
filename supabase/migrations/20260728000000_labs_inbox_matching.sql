-- ============================================================
-- LedgerX Labs: match statement line items against pending email-inbox
-- receipts, and categorize any candidate in the same pass (v13.3)
-- ============================================================
--
-- The existing CC reconciliation candidate pool (list_reconciliation_candidates)
-- only covers rows already saved as `expenses`. Receipts still sitting in a
-- user's forwarded-email inbox (`email_inbox`, status='pending') were
-- invisible to matching entirely. This adds:
--
--   1. list_reconciliation_inbox_candidates() — surfaces pending inbox
--      receipts shaped so the existing client-side scoreCandidate/
--      rankCandidates logic can score them exactly like an `expenses` row,
--      no algorithm fork needed.
--   2. match_inbox_item_to_line_item() — the "confirm" step: creates the
--      real `expenses` row (+ expense_images) from the inbox item, flips
--      the inbox row to 'accepted', and matches it to the line item, all
--      atomically. Storage upload/copy happens client-side first (Postgres
--      can't move bytes between storage prefixes) — this RPC only writes
--      the already-uploaded destination paths.
--   3. set_expense_category() — lets a Labs-eligible admin categorize any
--      candidate they can already act on, independent of matching, so
--      "categorize while you match" doesn't require a trip to Edit Expense.
--
-- Scope decision: inbox-sourced matching is FULL-ADMIN ONLY, not extended
-- to household admins. email_inbox has no household_id at all and its
-- existing RLS (20260430000000) never granted household admins visibility
-- into other users' inbox rows — inventing a new cross-household visibility
-- rule for an unscoped table would be weaker-grounded than every other rule
-- in this feature. Household admins keep their current expense-only
-- reconciliation experience unchanged.
--
-- Safe to re-run.

-- ─── 1. Inbox candidates, shaped for the existing matching algorithm ─────────
CREATE OR REPLACE FUNCTION list_reconciliation_inbox_candidates()
RETURNS TABLE (
  id                 uuid,
  from_email         text,
  subject            text,
  received_at        timestamptz,
  attachment_paths   jsonb,
  vendor             text,
  total              numeric,
  expense_date       date,
  notes              text,
  submitter_user_id  uuid,
  submitter_username text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    ei.id,
    ei.from_email,
    ei.subject,
    ei.received_at,
    ei.attachment_paths,
    NULLIF(btrim(COALESCE(ei.prefilled->>'vendor_name', '')), ''),
    (ei.prefilled->>'total_amount')::numeric,
    COALESCE((ei.prefilled->>'transaction_date')::date, ei.received_at::date),
    NULLIF(btrim(COALESCE(ei.prefilled->>'handwritten_notes', '')), ''),
    ei.user_id,
    up.username
  FROM email_inbox ei
  LEFT JOIN user_profiles up ON up.id = ei.user_id
  WHERE is_admin()
    AND ei.status = 'pending'
    AND ei.kind = 'expense'
    AND (ei.prefilled->>'total_amount') IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION list_reconciliation_inbox_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_reconciliation_inbox_candidates() TO authenticated;

-- ─── 2. Confirm a match against an inbox item — creates the expense too ──────
-- p_images: jsonb array of {path, mime, width, height}, already uploaded by
-- the client to receipts/{p_household_id}/... (mirrors AddExpense.tsx's own
-- email-inbox-to-expense reupload path). First entry also fills the legacy
-- expenses.image_* columns; every entry gets an expense_images row.
CREATE OR REPLACE FUNCTION match_inbox_item_to_line_item(
  p_line_item_id uuid,
  p_inbox_id     uuid,
  p_household_id uuid,
  p_category     text DEFAULT NULL,
  p_images       jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inbox      email_inbox%ROWTYPE;
  v_expense_id uuid;
  v_image      jsonb;
  v_idx        int := 0;
  v_first_path text;
  v_first_mime text;
  v_first_w    int;
  v_first_h    int;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_inbox FROM email_inbox WHERE id = p_inbox_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inbox item not found or already processed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM households WHERE id = p_household_id) THEN
    RAISE EXCEPTION 'household not found';
  END IF;

  IF jsonb_array_length(COALESCE(p_images, '[]'::jsonb)) > 0 THEN
    v_image := p_images->0;
    v_first_path := v_image->>'path';
    v_first_mime := v_image->>'mime';
    v_first_w    := NULLIF(v_image->>'width', '')::int;
    v_first_h    := NULLIF(v_image->>'height', '')::int;
  END IF;

  INSERT INTO expenses (
    household_id, created_by, expense_date, vendor, total, category, notes,
    image_path, image_mime, image_width, image_height
  )
  VALUES (
    p_household_id,
    v_inbox.user_id,
    COALESCE((v_inbox.prefilled->>'transaction_date')::date, v_inbox.received_at::date),
    NULLIF(btrim(COALESCE(v_inbox.prefilled->>'vendor_name', '')), ''),
    COALESCE((v_inbox.prefilled->>'total_amount')::numeric, 0),
    NULLIF(btrim(COALESCE(p_category, '')), ''),
    NULLIF(btrim(COALESCE(v_inbox.prefilled->>'handwritten_notes', '')), ''),
    v_first_path, v_first_mime, v_first_w, v_first_h
  )
  RETURNING id INTO v_expense_id;

  FOR v_image IN SELECT * FROM jsonb_array_elements(COALESCE(p_images, '[]'::jsonb))
  LOOP
    INSERT INTO expense_images (expense_id, image_path, image_mime, image_width, image_height, display_order)
    VALUES (
      v_expense_id,
      v_image->>'path',
      v_image->>'mime',
      NULLIF(v_image->>'width', '')::int,
      NULLIF(v_image->>'height', '')::int,
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE email_inbox SET status = 'accepted' WHERE id = p_inbox_id;

  UPDATE statement_line_items
  SET    matched_expense_id = v_expense_id,
         matched_at = now(),
         matched_by = auth.uid()
  WHERE  id = p_line_item_id
    AND  matched_expense_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'line item already matched';
  END IF;

  RETURN v_expense_id;
END;
$$;

REVOKE ALL ON FUNCTION match_inbox_item_to_line_item(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_inbox_item_to_line_item(uuid, uuid, uuid, text, jsonb) TO authenticated;

-- ─── 3. Categorize any candidate the caller can already act on ───────────────
-- Reuses can_act_on_expense() — the same authorization surface already
-- backing match/unmatch — so a household admin can categorize anything
-- they can already see/match, a full admin can categorize anything.
CREATE OR REPLACE FUNCTION set_expense_category(p_expense_id uuid, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT can_act_on_expense(p_expense_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE expenses
  SET    category = NULLIF(btrim(COALESCE(p_category, '')), '')
  WHERE  id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION set_expense_category(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_expense_category(uuid, text) TO authenticated;

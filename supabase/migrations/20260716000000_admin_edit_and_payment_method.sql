-- ============================================================
-- Migration: admin field edits + payment method + delete notifications (v12.1)
-- ============================================================
--
-- Three independent additions, all following existing conventions:
--
--   1. Full admins can edit more invoice/estimate fields (e.g. add a missing
--      invoice number). No UPDATE RLS exists on either table by design — edits
--      go through is_admin()-gated SECURITY DEFINER RPCs. We EXTEND the existing
--      admin_update_invoice_details and ADD a sibling admin_update_estimate.
--   2. Marking an invoice paid can record a payment method (venmo/zelle/ach/
--      check/credit/other) + an optional note. New nullable columns +
--      admin_update_invoice_status extended to persist them.
--   3. Users can DELETE notifications from their bell (removes only their own
--      notification row; the underlying estimate/invoice/message data is a
--      separate table and is untouched). New delete_notifications RPC mirrors
--      mark_notifications_read.

-- ─── 1. Payment method columns on contractor_invoices ────────────────────────
ALTER TABLE contractor_invoices
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL
           OR payment_method IN ('venmo', 'zelle', 'ach', 'check', 'credit', 'other'));
ALTER TABLE contractor_invoices
  ADD COLUMN IF NOT EXISTS payment_method_note text;

-- ─── 2. Mark-paid RPC now records the payment method ─────────────────────────
-- Old signature was (uuid, text, text). Adding trailing DEFAULT NULL params
-- changes the identity, so drop the old one first, then recreate. A 3-arg call
-- still resolves (the new params default to NULL). Payment fields are only
-- written when the invoice is being set to 'paid'; flipping back to pending
-- leaves the last recorded method in place (harmless history).
DROP FUNCTION IF EXISTS admin_update_invoice_status(uuid, text, text);
CREATE OR REPLACE FUNCTION admin_update_invoice_status(
  p_invoice_id          uuid,
  p_status              text,
  p_admin_notes         text DEFAULT NULL,
  p_payment_method      text DEFAULT NULL,
  p_payment_method_note text DEFAULT NULL
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

  IF p_status NOT IN ('pending', 'paid') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  IF p_payment_method IS NOT NULL
     AND p_payment_method NOT IN ('venmo', 'zelle', 'ach', 'check', 'credit', 'other') THEN
    RAISE EXCEPTION 'invalid payment method: %', p_payment_method;
  END IF;

  UPDATE contractor_invoices
  SET
    status      = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    paid_at     = CASE WHEN p_status = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
    payment_method = CASE WHEN p_status = 'paid' THEN p_payment_method ELSE payment_method END,
    payment_method_note = CASE
                            WHEN p_status = 'paid'
                            THEN NULLIF(btrim(COALESCE(p_payment_method_note, '')), '')
                            ELSE payment_method_note
                          END,
    updated_at  = now()
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_invoice_status(uuid, text, text, text, text) TO authenticated;

-- ─── 3. Extend admin_update_invoice_details with the core financial fields ───
-- Adds invoice_number / amount / description / service dates. All new params
-- default to a sentinel so a 4-arg call keeps the old behavior; the admin edit
-- modal always sends the full set. invoice_number is nullable (can be cleared);
-- amount/description/dates are NOT NULL in the table, so a NULL/blank incoming
-- value is treated as "leave unchanged".
DROP FUNCTION IF EXISTS admin_update_invoice_details(uuid, uuid, uuid, text);
CREATE OR REPLACE FUNCTION admin_update_invoice_details(
  p_invoice_id        uuid,
  p_household_id      uuid,
  p_category_id       uuid,
  p_admin_notes       text,
  p_invoice_number    text DEFAULT NULL,
  p_amount            numeric DEFAULT NULL,
  p_description       text DEFAULT NULL,
  p_service_date_start date DEFAULT NULL,
  p_service_date_end   date DEFAULT NULL,
  -- distinguishes "field omitted" from "field explicitly set" for the two
  -- fields where NULL/blank is itself a meaningful value:
  p_set_invoice_number boolean DEFAULT false
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

  IF NOT EXISTS (SELECT 1 FROM contractor_invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  IF p_household_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM households WHERE id = p_household_id) THEN
    RAISE EXCEPTION 'household not found';
  END IF;

  IF p_category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'category not found';
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'amount must be >= 0';
  END IF;

  IF p_service_date_start IS NOT NULL AND p_service_date_end IS NOT NULL
     AND p_service_date_end < p_service_date_start THEN
    RAISE EXCEPTION 'service end date must be on or after start date';
  END IF;

  UPDATE contractor_invoices
  SET
    household_id = p_household_id,
    category_id  = p_category_id,
    admin_notes  = p_admin_notes,
    invoice_number = CASE WHEN p_set_invoice_number
                          THEN NULLIF(btrim(COALESCE(p_invoice_number, '')), '')
                          ELSE invoice_number END,
    amount       = COALESCE(p_amount, amount),
    description  = COALESCE(NULLIF(btrim(COALESCE(p_description, '')), ''), description),
    service_date_start = COALESCE(p_service_date_start, service_date_start),
    service_date_end   = COALESCE(p_service_date_end, service_date_end),
    updated_at   = now()
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_invoice_details(
  uuid, uuid, uuid, text, text, numeric, text, date, date, boolean) TO authenticated;

-- ─── 4. admin_update_estimate — edit estimate fields (mirrors status RPC) ─────
-- Estimates carry no monetary amount; editable fields are title / description /
-- billing_type / household / admin_notes. title is NOT NULL (blank => unchanged);
-- description & admin_notes are nullable (blank => cleared to NULL).
CREATE OR REPLACE FUNCTION admin_update_estimate(
  p_estimate_id  uuid,
  p_title        text,
  p_description  text,
  p_billing_type text,
  p_household_id uuid,
  p_admin_notes  text
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

  IF NOT EXISTS (SELECT 1 FROM estimates WHERE id = p_estimate_id) THEN
    RAISE EXCEPTION 'estimate not found';
  END IF;

  IF p_billing_type IS NOT NULL AND p_billing_type NOT IN ('total', 'labor_only') THEN
    RAISE EXCEPTION 'invalid billing type: %', p_billing_type;
  END IF;

  IF p_household_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM households WHERE id = p_household_id) THEN
    RAISE EXCEPTION 'household not found';
  END IF;

  UPDATE estimates
  SET
    title        = COALESCE(NULLIF(btrim(COALESCE(p_title, '')), ''), title),
    description  = NULLIF(btrim(COALESCE(p_description, '')), ''),
    billing_type = COALESCE(p_billing_type, billing_type),
    household_id = p_household_id,
    admin_notes  = NULLIF(btrim(COALESCE(p_admin_notes, '')), ''),
    updated_at   = now()
  WHERE id = p_estimate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_estimate(uuid, text, text, text, uuid, text) TO authenticated;

-- ─── 5. delete_notifications — user removes their own bell rows ───────────────
-- Mirrors mark_notifications_read: scoped to auth.uid(), optional id filter.
-- Deletes ONLY the caller's notification rows — the estimate/invoice/message
-- records those notifications point at live in other tables and are untouched.
CREATE OR REPLACE FUNCTION delete_notifications(p_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM notifications
  WHERE user_id = auth.uid()
    AND (p_ids IS NULL OR id = ANY (p_ids));
$$;

REVOKE ALL ON FUNCTION delete_notifications(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_notifications(uuid[]) TO authenticated;

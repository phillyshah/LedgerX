-- ============================================================
-- Migration: admins can edit an invoice's payment method (v13.22)
-- ============================================================
--
-- The payment_method / payment_method_note columns have existed since v12.1
-- (20260716000000), but the ONLY way to set them was admin_update_invoice_status
-- while marking an invoice paid. That left three things impossible:
--
--   1. Recording how an invoice will be / was paid on a PENDING invoice.
--   2. Correcting a method chosen by mistake — the mark-paid modal is a
--      one-shot, and re-running it on an already-paid invoice is not a flow
--      the UI offers.
--   3. Capturing payment detail at all without stuffing it into the
--      contractor-authored `description`, which is exactly what admins have
--      been doing ("Please Zelle payment to 412-585-3852").
--
-- This extends admin_update_invoice_details — the RPC behind the admin "Edit
-- invoice" modal — with the same two columns. Same is_admin() gate, same
-- SECURITY DEFINER pattern, same validation list as the status RPC.
--
-- Adding parameters changes a function's identity, so the previous 10-arg
-- version is dropped first. Nothing calls it with 10 args once the frontend
-- ships, but the sentinel below keeps a short call harmless regardless.

DROP FUNCTION IF EXISTS admin_update_invoice_details(
  uuid, uuid, uuid, text, text, numeric, text, date, date, boolean);

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
  -- distinguishes "field omitted" from "field explicitly set" for the fields
  -- where NULL/blank is itself a meaningful value:
  p_set_invoice_number boolean DEFAULT false,
  p_payment_method     text DEFAULT NULL,
  p_payment_method_note text DEFAULT NULL,
  p_set_payment_method boolean DEFAULT false
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

  -- Same allow-list the CHECK constraint and admin_update_invoice_status use.
  -- Validated here too so the error is a clear message rather than a raw
  -- constraint violation surfacing in the UI.
  IF p_set_payment_method
     AND p_payment_method IS NOT NULL
     AND p_payment_method NOT IN ('venmo', 'zelle', 'ach', 'check', 'credit', 'other') THEN
    RAISE EXCEPTION 'invalid payment method: %', p_payment_method;
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
    payment_method = CASE WHEN p_set_payment_method
                          THEN p_payment_method
                          ELSE payment_method END,
    -- The note belongs to the method: clearing the method clears the note, so
    -- an invoice can never show "Not recorded" next to a stale detail line.
    payment_method_note = CASE
                            WHEN NOT p_set_payment_method THEN payment_method_note
                            WHEN p_payment_method IS NULL  THEN NULL
                            ELSE NULLIF(btrim(COALESCE(p_payment_method_note, '')), '')
                          END,
    updated_at   = now()
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_invoice_details(
  uuid, uuid, uuid, text, text, numeric, text, date, date, boolean,
  text, text, boolean) TO authenticated;

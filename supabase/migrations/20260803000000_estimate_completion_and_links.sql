-- ============================================================
-- Migration: Estimate completion + linking actual spend to a quote
-- Date: 2026-08-03  (v13.17)
-- ============================================================
--
-- Two related additions to the estimates stack (20260701000000):
--
--   1. A fourth status, 'completed'. An estimate is accepted, the work
--      happens, and then it needs closing out. Until now 'accepted' was
--      terminal, so finished jobs sat in the list forever alongside live
--      ones.
--
--   2. estimate_links — the first relationship between estimates and the
--      money actually spent against them. One estimate takes many
--      receipts and/or many contractor invoices; each receipt or invoice
--      belongs to at most one estimate, so a job's actual cost can't be
--      double-counted across two quotes.
--
-- estimates also gains `amount` / `currency`. Estimates were explicitly
-- amount-less before ("Estimates carry no monetary amount" —
-- 20260716000000), with the quoted figure living only in the attachment
-- or the chat thread. Without a structured number there is nothing to
-- compare the linked spend against, so the whole point of (2) is lost.
-- It is nullable: every existing estimate reads as "no quoted amount"
-- until someone edits it, and the UI shows the matched total alone
-- rather than inventing a variance.
--
-- Convention notes, both copied deliberately from the reconciliation
-- stack (20260722000000) rather than re-derived:
--   * No client INSERT/UPDATE/DELETE policy on estimate_links at all —
--     every mutation goes through the SECURITY DEFINER RPCs below, which
--     stamp linked_by/linked_at server-side.
--   * Partial unique indexes, not application logic, are what actually
--     prevent double-linking.
--
-- Idempotent: safe to re-run.

-- ─── 1. estimates: allow 'completed', add the quoted amount ──────────────────

ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
ALTER TABLE estimates ADD CONSTRAINT estimates_status_check
  CHECK (status IN ('open', 'accepted', 'rejected', 'completed'));

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS amount   numeric(12,2);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

-- ─── 2. estimate_links ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS estimate_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  -- Exactly one of these is set. A CHECK is used rather than two tables
  -- because every consumer wants them interleaved in one list.
  expense_id  uuid        REFERENCES expenses(id) ON DELETE CASCADE,
  invoice_id  uuid        REFERENCES contractor_invoices(id) ON DELETE CASCADE,
  linked_by   uuid        REFERENCES auth.users(id),
  linked_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_links_one_target CHECK (num_nonnulls(expense_id, invoice_id) = 1)
);

CREATE INDEX IF NOT EXISTS estimate_links_estimate_id_idx ON estimate_links(estimate_id);

-- A receipt / an invoice belongs to at most one estimate. These are what
-- make "matched spend" a number you can trust rather than a sum with
-- duplicates in it.
CREATE UNIQUE INDEX IF NOT EXISTS estimate_links_expense_uniq
  ON estimate_links(expense_id) WHERE expense_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS estimate_links_invoice_uniq
  ON estimate_links(invoice_id) WHERE invoice_id IS NOT NULL;

ALTER TABLE estimate_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view estimate links" ON estimate_links;
CREATE POLICY "Admins view estimate links" ON estimate_links
  FOR SELECT TO authenticated
  USING (is_admin());

-- Deliberately no INSERT / UPDATE / DELETE policy — see the header note.

-- ─── 3. admin_set_estimate_status — widen the whitelist ──────────────────────
-- The CHECK constraint above is not the only gate: this RPC carries its own
-- hardcoded list and would reject 'completed' with `invalid status`.

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

  IF p_status NOT IN ('open', 'accepted', 'rejected', 'completed') THEN
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

-- ─── 4. admin_update_estimate — now also edits the quoted amount ─────────────
-- Adding a parameter to an existing function creates an ambiguous overload
-- rather than replacing it, so the old signature is dropped first (same
-- gotcha as list_reconciliation_candidates in 20260729000000).

DROP FUNCTION IF EXISTS admin_update_estimate(uuid, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION admin_update_estimate(
  p_estimate_id  uuid,
  p_title        text,
  p_description  text,
  p_billing_type text,
  p_household_id uuid,
  p_admin_notes  text,
  p_amount       numeric DEFAULT NULL
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

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'amount must not be negative';
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
    -- Nullable on purpose: clearing the amount back to "not quoted" is a
    -- legitimate edit, so this is a straight assignment, not a COALESCE.
    amount       = p_amount,
    updated_at   = now()
  WHERE id = p_estimate_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_update_estimate(uuid, text, text, text, uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_estimate(uuid, text, text, text, uuid, text, numeric) TO authenticated;

-- ─── 5. link_estimate_item ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION link_estimate_item(
  p_estimate_id uuid,
  p_expense_id  uuid DEFAULT NULL,
  p_invoice_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF num_nonnulls(p_expense_id, p_invoice_id) <> 1 THEN
    RAISE EXCEPTION 'pass exactly one of p_expense_id / p_invoice_id';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM estimates WHERE id = p_estimate_id) THEN
    RAISE EXCEPTION 'estimate not found';
  END IF;

  IF p_expense_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM expenses WHERE id = p_expense_id) THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  IF p_invoice_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM contractor_invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  BEGIN
    INSERT INTO estimate_links (estimate_id, expense_id, invoice_id, linked_by)
    VALUES (p_estimate_id, p_expense_id, p_invoice_id, auth.uid())
    RETURNING id INTO v_link_id;
  EXCEPTION WHEN unique_violation THEN
    -- Distinguishable on purpose: the client turns this into "already
    -- linked to another estimate" rather than surfacing raw SQLSTATE.
    RAISE EXCEPTION 'already linked to another estimate';
  END;

  RETURN v_link_id;
END;
$$;

REVOKE ALL ON FUNCTION link_estimate_item(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_estimate_item(uuid, uuid, uuid) TO authenticated;

-- ─── 6. unlink_estimate_item ─────────────────────────────────────────────────
-- Idempotent: unlinking something already gone is a no-op, not an error
-- (same shape as unmatch_statement_line_item).

CREATE OR REPLACE FUNCTION unlink_estimate_item(p_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM estimate_links WHERE id = p_link_id;
END;
$$;

REVOKE ALL ON FUNCTION unlink_estimate_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unlink_estimate_item(uuid) TO authenticated;

-- ─── 7. list_estimate_links ──────────────────────────────────────────────────
-- Expenses and invoices interleaved in one list, discriminated by `kind`,
-- so the client renders a single ordered timeline and sums one column.

CREATE OR REPLACE FUNCTION list_estimate_links(p_estimate_id uuid)
RETURNS TABLE (
  link_id     uuid,
  kind        text,
  item_id     uuid,
  occurred_on date,
  label       text,
  detail      text,
  amount      numeric,
  currency    text,
  linked_at   timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    l.id,
    'expense'::text,
    e.id,
    e.expense_date,
    COALESCE(NULLIF(btrim(e.vendor), ''), '—'),
    e.category,
    e.total,
    e.currency,
    l.linked_at
  FROM estimate_links l
  JOIN expenses e ON e.id = l.expense_id
  WHERE is_admin() AND l.estimate_id = p_estimate_id

  UNION ALL

  SELECT
    l.id,
    'invoice'::text,
    i.id,
    i.service_date_start,
    COALESCE(NULLIF(btrim(i.invoice_number), ''), '—'),
    i.description,
    i.amount,
    i.currency,
    l.linked_at
  FROM estimate_links l
  JOIN contractor_invoices i ON i.id = l.invoice_id
  WHERE is_admin() AND l.estimate_id = p_estimate_id

  ORDER BY 4 DESC, 9 DESC;
$$;

REVOKE ALL ON FUNCTION list_estimate_links(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_estimate_links(uuid) TO authenticated;

-- ─── 8. list_estimate_link_candidates ────────────────────────────────────────
-- Everything not already linked to some estimate, scoped to the estimate's
-- household when it has one. Deliberately NOT scored: scoreCandidate()
-- in the reconciliation stack hard-gates on the amount matching within
-- $0.50, which is right for one card charge against one receipt and wrong
-- here — a $5,000 quote is satisfied by an invoice plus several smaller
-- receipts, so every candidate would score null. Ordered newest-first and
-- the admin picks.

CREATE OR REPLACE FUNCTION list_estimate_link_candidates(p_estimate_id uuid)
RETURNS TABLE (
  kind         text,
  item_id      uuid,
  occurred_on  date,
  label        text,
  detail       text,
  amount       numeric,
  currency     text,
  household_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  WITH est AS (
    SELECT id, household_id FROM estimates WHERE id = p_estimate_id
  )
  SELECT
    'expense'::text,
    e.id,
    e.expense_date,
    COALESCE(NULLIF(btrim(e.vendor), ''), '—'),
    e.category,
    e.total,
    e.currency,
    e.household_id
  FROM expenses e
  CROSS JOIN est
  WHERE is_admin()
    AND (est.household_id IS NULL OR e.household_id = est.household_id)
    AND NOT EXISTS (SELECT 1 FROM estimate_links l WHERE l.expense_id = e.id)

  UNION ALL

  SELECT
    'invoice'::text,
    i.id,
    i.service_date_start,
    COALESCE(NULLIF(btrim(i.invoice_number), ''), '—'),
    i.description,
    i.amount,
    i.currency,
    i.household_id
  FROM contractor_invoices i
  CROSS JOIN est
  WHERE is_admin()
    AND (est.household_id IS NULL OR i.household_id = est.household_id)
    AND NOT EXISTS (SELECT 1 FROM estimate_links l WHERE l.invoice_id = i.id)

  ORDER BY 3 DESC;
$$;

REVOKE ALL ON FUNCTION list_estimate_link_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_estimate_link_candidates(uuid) TO authenticated;

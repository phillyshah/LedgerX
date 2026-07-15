-- ============================================================
-- LedgerX Labs: Credit Card Statement Reconciliation (v12.3)
-- ============================================================
--
-- First feature in a new "Labs" area — experimental, per-household
-- opt-in via households.features_enabled.labs_cc_reconciliation.
--
-- Shape: the SUPER ADMIN uploads a card statement (CSV or PDF/image,
-- OCR'd client-side via a new edge function). A statement is NOT
-- household-scoped — one card can cover purchases across several
-- properties, so credit_card_statements carries no household_id.
-- Individual line items are matched to whichever household's expense
-- they actually belong to. Any non-contractor member of a
-- Labs-flagged household can see unmatched line items and claim the
-- ones that are theirs — there's no pre-assignment/routing step.
--
-- Fully additive: zero changes to the `expenses` table itself.
--
-- Tables:
--   credit_card_statements — one row per upload (admin-only writes)
--   statement_line_items   — child rows; matching is RPC-only, never
--                             a direct client UPDATE (see §3 below)
--
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / guarded blocks).

-- ─── 1. credit_card_statements ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_card_statements (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  card_label     text        NOT NULL,                      -- e.g. "Chase Ink ...1234"
  period_start   date,
  period_end     date,
  file_path      text        NOT NULL,                      -- receipts/statements/{id}.{ext}
  file_mime      text,
  source_type    text        NOT NULL DEFAULT 'csv'
                             CHECK (source_type IN ('csv', 'pdf', 'image')),
  column_mapping jsonb,                                     -- CSV path only: {date_col, description_col, amount_col, sign_flip}
  status         text        NOT NULL DEFAULT 'processing'
                             CHECK (status IN ('processing', 'ready', 'error')),
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Belt-and-suspenders NULL guard on uploaded_by, same three-layer shape as
-- expenses.created_by (20260504000000) — column DEFAULT above plus this
-- trigger, since a service-role or programmatic insert could still omit it.
CREATE OR REPLACE FUNCTION statements_set_uploaded_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.uploaded_by IS NULL THEN
    NEW.uploaded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_statements_set_uploaded_by ON credit_card_statements;
CREATE TRIGGER trg_statements_set_uploaded_by
  BEFORE INSERT ON credit_card_statements
  FOR EACH ROW EXECUTE FUNCTION statements_set_uploaded_by();

ALTER TABLE credit_card_statements ENABLE ROW LEVEL SECURITY;

-- SELECT: admins, or any non-contractor member of at least one Labs-flagged
-- household. This is what makes the per-household flag meaningful even
-- though a statement itself isn't tied to one household — flipping a
-- household's flag on is what lets its members see the tool at all.
DROP POLICY IF EXISTS "Labs-eligible members and admins view statements" ON credit_card_statements;
CREATE POLICY "Labs-eligible members and admins view statements"
  ON credit_card_statements FOR SELECT
  USING (
    is_admin()
    OR (
      NOT is_contractor()
      AND EXISTS (
        SELECT 1
        FROM household_members hm
        JOIN households h ON h.id = hm.household_id
        WHERE hm.user_id = auth.uid()
          AND COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
      )
    )
  );

-- INSERT/UPDATE/DELETE: admin-only ("super admin" uploads, per product
-- decision — this is not a household-member action like submitting an
-- expense is).
DROP POLICY IF EXISTS "Admins manage statements" ON credit_card_statements;
CREATE POLICY "Admins manage statements"
  ON credit_card_statements FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── 2. statement_line_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statement_line_items (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id       uuid        NOT NULL REFERENCES credit_card_statements(id) ON DELETE CASCADE,
  line_date          date        NOT NULL,
  description        text        NOT NULL,
  amount             numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency           text        NOT NULL DEFAULT 'USD',
  matched_expense_id uuid        REFERENCES expenses(id) ON DELETE SET NULL,
  matched_at         timestamptz,
  matched_by         uuid        REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statement_line_items_statement_id_idx
  ON statement_line_items(statement_id);

-- One expense can't be double-claimed by two different card charges.
CREATE UNIQUE INDEX IF NOT EXISTS statement_line_items_matched_expense_uniq
  ON statement_line_items(matched_expense_id)
  WHERE matched_expense_id IS NOT NULL;

ALTER TABLE statement_line_items ENABLE ROW LEVEL SECURITY;

-- SELECT: same Labs-eligibility rule as the parent statement, joined through.
DROP POLICY IF EXISTS "Labs-eligible members and admins view line items" ON statement_line_items;
CREATE POLICY "Labs-eligible members and admins view line items"
  ON statement_line_items FOR SELECT
  USING (
    is_admin()
    OR (
      NOT is_contractor()
      AND EXISTS (
        SELECT 1
        FROM household_members hm
        JOIN households h ON h.id = hm.household_id
        WHERE hm.user_id = auth.uid()
          AND COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
      )
    )
  );

-- INSERT: admin-only (line items are created by the admin's upload/OCR flow,
-- never carrying a match at insert time — the CHECK enforces that).
DROP POLICY IF EXISTS "Admins insert line items" ON statement_line_items;
CREATE POLICY "Admins insert line items"
  ON statement_line_items FOR INSERT
  WITH CHECK (is_admin() AND matched_expense_id IS NULL);

-- No client UPDATE/DELETE policy at all — every match/unmatch mutation goes
-- exclusively through the SECURITY DEFINER RPCs below, which validate the
-- caller can act on the *target expense* (not just the statement) and stamp
-- matched_by/matched_at server-side. A plain RLS UPDATE policy here can't
-- cleanly express "and the expense being linked belongs to a household the
-- caller can touch" without duplicating the RPC's logic anyway.
DROP POLICY IF EXISTS "Admins delete line items" ON statement_line_items;
CREATE POLICY "Admins delete line items"
  ON statement_line_items FOR DELETE
  USING (is_admin());

-- ─── 3. Matching RPCs (member-gated, not admin-only) ─────────────────────────
-- "Can the caller act on this expense?" — the same access rule already used
-- everywhere else in this app for expense mutation: a member of the
-- expense's household, the expense's own creator, or a full admin.
CREATE OR REPLACE FUNCTION can_act_on_expense(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT is_admin() OR EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = p_expense_id
      AND (
        e.created_by = auth.uid()
        OR e.household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
      )
  );
$$;

REVOKE ALL ON FUNCTION can_act_on_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_act_on_expense(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION match_statement_line_item(p_line_item_id uuid, p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT can_act_on_expense(p_expense_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE statement_line_items
  SET    matched_expense_id = p_expense_id,
         matched_at = now(),
         matched_by = auth.uid()
  WHERE  id = p_line_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'line item not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION match_statement_line_item(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_statement_line_item(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION unmatch_statement_line_item(p_line_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expense_id uuid;
BEGIN
  SELECT matched_expense_id INTO v_expense_id
  FROM statement_line_items WHERE id = p_line_item_id;

  IF v_expense_id IS NULL THEN
    RETURN; -- already unmatched, nothing to do
  END IF;

  IF NOT can_act_on_expense(v_expense_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE statement_line_items
  SET    matched_expense_id = NULL,
         matched_at = NULL,
         matched_by = NULL
  WHERE  id = p_line_item_id;
END;
$$;

REVOKE ALL ON FUNCTION unmatch_statement_line_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unmatch_statement_line_item(uuid) TO authenticated;

-- Bulk auto-match: one round trip for N proposed pairs. Reports partial
-- success rather than aborting the whole batch — a race (an expense matched
-- elsewhere between suggestion and confirm) is expected, not exceptional.
CREATE OR REPLACE FUNCTION bulk_match_statement_line_items(p_matches jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pair       jsonb;
  v_line_id    uuid;
  v_expense_id uuid;
  v_matched    int := 0;
  v_skipped    jsonb := '[]'::jsonb;
BEGIN
  FOR v_pair IN SELECT * FROM jsonb_array_elements(COALESCE(p_matches, '[]'::jsonb))
  LOOP
    v_line_id    := (v_pair->>'line_item_id')::uuid;
    v_expense_id := (v_pair->>'expense_id')::uuid;

    BEGIN
      IF NOT can_act_on_expense(v_expense_id) THEN
        v_skipped := v_skipped || jsonb_build_object('line_item_id', v_line_id, 'reason', 'not_authorized');
        CONTINUE;
      END IF;

      UPDATE statement_line_items
      SET    matched_expense_id = v_expense_id,
             matched_at = now(),
             matched_by = auth.uid()
      WHERE  id = v_line_id
        AND  matched_expense_id IS NULL; -- don't clobber a concurrent match

      IF FOUND THEN
        v_matched := v_matched + 1;
      ELSE
        v_skipped := v_skipped || jsonb_build_object('line_item_id', v_line_id, 'reason', 'already_matched_or_missing');
      END IF;
    EXCEPTION WHEN unique_violation THEN
      -- the target expense got claimed by another line item in this same
      -- batch (or concurrently) between our check and the write
      v_skipped := v_skipped || jsonb_build_object('line_item_id', v_line_id, 'reason', 'expense_already_claimed');
    END;
  END LOOP;

  RETURN jsonb_build_object('matched', v_matched, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION bulk_match_statement_line_items(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_match_statement_line_items(jsonb) TO authenticated;

-- ─── 4. Storage: statements/ prefix (admin-write, Labs-eligible-read) ────────
-- Statements have no household_id, so the existing household-first-segment
-- storage RLS on the `receipts` bucket doesn't apply — this needs its own
-- narrow policies, same shape as the email-inbox/{user_id}/... carve-out
-- (20260430120000). Path convention: statements/{statement_id}.{ext}.
DROP POLICY IF EXISTS "Admins write statement files" ON storage.objects;
CREATE POLICY "Admins write statement files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = 'statements'
    AND is_admin()
  );

DROP POLICY IF EXISTS "Admins delete statement files" ON storage.objects;
CREATE POLICY "Admins delete statement files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = 'statements'
    AND is_admin()
  );

DROP POLICY IF EXISTS "Labs-eligible members and admins read statement files" ON storage.objects;
CREATE POLICY "Labs-eligible members and admins read statement files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = 'statements'
    AND (
      is_admin()
      OR (
        NOT is_contractor()
        AND EXISTS (
          SELECT 1
          FROM household_members hm
          JOIN households h ON h.id = hm.household_id
          WHERE hm.user_id = auth.uid()
            AND COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
        )
      )
    )
  );

-- ─── 5. Feature-flag convention (no schema change — households.features_enabled
--        already exists, 20260421000000) ──────────────────────────────────────
-- features_enabled.labs_cc_reconciliation = true → household is opted into
-- the Labs credit-card-reconciliation experiment: its members can see the
-- Labs nav entry, browse statements, and match their own expenses.
-- Toggled via the existing admin_update_household_features() RPC — no new
-- admin RPC needed for this.

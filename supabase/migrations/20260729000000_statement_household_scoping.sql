-- ============================================================
-- LedgerX Labs: scope a statement's matching pool to specific
-- households, optionally, at upload time (v13.4)
-- ============================================================
--
-- Today `list_reconciliation_candidates()` always pools every expense
-- across EVERY Labs-flagged household at once. That's the right default
-- for a card that genuinely spans several properties, but it also means
-- automatic matching is working against a much noisier pool than it needs
-- to be — two different properties with an identical charge amount are
-- indistinguishable to the matcher, which quietly suppresses high-confidence
-- auto-match hits that would otherwise be obvious.
--
-- This adds an OPTIONAL admin choice at upload time: tag a statement with
-- one or more households it actually covers. When a statement has assigned
-- households, its candidate pool narrows to just those households' expenses
-- — PLUS, unconditionally, any expense with no category yet at all (likely
-- misfiled/unresolved data that could easily belong to this statement even
-- if it landed in the wrong household or none) — PLUS the existing pending
-- email-inbox pool (untouched; inbox rows have no household concept). A
-- statement with NO assigned households keeps today's broad, all-households
-- behavior exactly as before — this is additive, not a breaking change for
-- existing/legacy statements.
--
-- Safe to re-run.

-- ─── 1. statement_households — optional many-to-many tag ─────────────────────
CREATE TABLE IF NOT EXISTS statement_households (
  statement_id uuid NOT NULL REFERENCES credit_card_statements(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (statement_id, household_id)
);

ALTER TABLE statement_households ENABLE ROW LEVEL SECURITY;

-- Same eligibility rule as the parent statement itself — anyone who can see
-- a statement can see which households it's scoped to.
DROP POLICY IF EXISTS "Labs-eligible members and admins view statement households" ON statement_households;
CREATE POLICY "Labs-eligible members and admins view statement households"
  ON statement_households FOR SELECT
  USING (is_labs_eligible('labs_cc_reconciliation'));

-- Same convention as credit_card_statements itself: statement management
-- (upload/rename/delete, and now household tagging) is admin-only, written
-- directly by the client — not RPC-gated, matching how file_path is patched
-- in after upload.
DROP POLICY IF EXISTS "Admins manage statement households" ON statement_households;
CREATE POLICY "Admins manage statement households"
  ON statement_households FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── 2. list_reconciliation_candidates() gains optional statement scoping ────
-- Changing a zero-arg function to take a DEFAULT-valued argument creates an
-- ambiguous overload with the old zero-arg version rather than replacing it
-- (same gotcha called out in 20260716000000's admin_update_invoice_status
-- comment) — drop the old signature first.
DROP FUNCTION IF EXISTS list_reconciliation_candidates();

CREATE OR REPLACE FUNCTION list_reconciliation_candidates(p_statement_id uuid DEFAULT NULL)
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
    )
    AND (
      -- No households assigned to this statement (p_statement_id NULL, or
      -- assigned to none) → no additional narrowing, same broad pool as
      -- always. NULL = NULL semantics naturally make this branch true
      -- whenever p_statement_id itself is NULL, too.
      NOT EXISTS (SELECT 1 FROM statement_households sh WHERE sh.statement_id = p_statement_id)
      OR e.household_id IN (SELECT sh.household_id FROM statement_households sh WHERE sh.statement_id = p_statement_id)
      OR e.category IS NULL
    );
$$;

REVOKE ALL ON FUNCTION list_reconciliation_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_reconciliation_candidates(uuid) TO authenticated;

-- Data integrity: expenses.created_by must never be NULL.
--
-- Root cause of the dmetcalf incident: the `ownOnly` flag introduced in
-- v6.3 scopes the dashboard query to `created_by = auth.uid()`. Any row
-- where created_by is NULL or points to a deleted/recreated auth user
-- becomes invisible to the submitter even though RLS SELECT still allows
-- it (SELECT policy only checks household membership, not created_by).
--
-- Three-layer fix:
--   1. Column DEFAULT   – new rows get auth.uid() automatically even if
--                         the application forgets to supply it.
--   2. BEFORE INSERT trigger – belt-and-suspenders: coerces NULL created_by
--                         to auth.uid() at the DB level on every INSERT.
--   3. NOT VALID CHECK  – documents the invariant; admin can VALIDATE after
--                         running the recovery script to backfill old NULLs.
--
-- Note: rows where created_by points to a user that was subsequently
-- deleted+recreated need a separate one-time backfill (see
-- scripts/recover_orphaned_expenses.sql).

-- 1. Column default
ALTER TABLE expenses
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- 2. Trigger to coerce NULL on INSERT (safety net for any path that
--    doesn't set created_by, e.g. direct SQL inserts or future edge fns).
CREATE OR REPLACE FUNCTION expenses_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_set_created_by ON expenses;
CREATE TRIGGER trg_expenses_set_created_by
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION expenses_set_created_by();

-- 3. NOT VALID check constraint — documents the invariant without blocking
--    the migration if legacy NULLs still exist. Run VALIDATE CONSTRAINT
--    after the recovery script has backfilled all NULLs.
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_created_by_not_null;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_created_by_not_null
  CHECK (created_by IS NOT NULL)
  NOT VALID;

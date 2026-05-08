-- Fix the new-user setup flow so a fresh user only ends up in the
-- households the admin explicitly chose for them.
--
-- Background
-- ----------
-- An older trigger (auto_assign_user_to_households, 20260210180038)
-- automatically inserted a household_members row for every existing
-- household whenever a new auth.users row was created. The admin-create
-- flow then *removed* the rows the admin hadn't checked.
--
-- Two failure modes fell out of that:
--   1. If the admin forgot to uncheck (or the checklist hadn't loaded
--      yet), the user silently got access to every household — including
--      every category mapped to those households. That's how Pat ended
--      up seeing categories from every property.
--   2. If the admin later trimmed Pat's memberships down to a single
--      household, any expenses Pat had submitted in his "old" households
--      became invisible to him: the expense SELECT RLS only checks
--      household membership, so revoking a membership hid every receipt
--      he'd ever submitted there — even though he authored it.
--
-- This migration:
--   * Drops the auto-assign trigger (the application now inserts
--     memberships explicitly from the admin's checklist; see the
--     companion ManageUsers.tsx change in the same release).
--   * Hardens the expenses SELECT policy so a user can always read
--     receipts they personally created, regardless of current
--     household membership. This is the same defense-in-depth pattern
--     we already use for created_by being NOT NULL.

-- 1. Remove the auto-assign trigger -----------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created_assign_households ON auth.users;
DROP FUNCTION IF EXISTS auto_assign_user_to_households();

-- 2. Expenses SELECT policy: also allow self-authored rows ------------------

DROP POLICY IF EXISTS "Users can view expenses" ON expenses;
DROP POLICY IF EXISTS "Users can view their household expenses" ON expenses;

CREATE POLICY "Users can view expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR created_by = auth.uid()
    OR (household_id IS NOT NULL AND household_id IN (SELECT user_households()))
  );

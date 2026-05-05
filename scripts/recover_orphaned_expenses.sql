-- ============================================================
-- LedgerX: Recover orphaned expenses for a specific user
-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor (as admin / service role).
-- It diagnoses the three failure modes that make a user's own expenses
-- invisible on their dashboard, then offers targeted UPDATE statements
-- to fix each one.
--
-- Background
-- ----------
-- Dashboard calls useExpenses({ ownOnly: true }), which appends
--   .eq('created_by', user.id)
-- to the Postgres query. Any expense where `created_by` is NULL or
-- holds a stale auth UUID (from a deleted+recreated account) will be
-- invisible to the user even though RLS SELECT still allows the row.
--
-- Usage
-- -----
-- 1. Replace 'dmetcalf' with the target username if needed.
-- 2. Run the DIAGNOSTIC block to see what's wrong.
-- 3. Run whichever RECOVERY block matches the diagnosis.
-- 4. After recovery, run the VALIDATE block to confirm the fix.
-- ============================================================

-- ── STEP 0: identify the user ───────────────────────────────────────────────

-- Finds the user's current auth UUID and profile data.
-- If this returns 0 rows the username doesn't exist → wrong username.
SELECT
  up.id           AS auth_uuid,
  up.username,
  au.email,
  au.created_at,
  au.last_sign_in_at
FROM user_profiles up
JOIN auth.users    au ON au.id = up.id
WHERE up.username = 'dmetcalf';

-- ── STEP 1: see every expense in the user's household(s) ────────────────────

-- This uses a service-role query (bypasses RLS) to show ALL expenses
-- in any household dmetcalf belongs to, even if created_by is wrong.
-- This is the ground truth of what's actually in the DB.
SELECT
  e.id,
  e.expense_date,
  e.vendor,
  e.total,
  e.currency,
  e.created_by,
  up_creator.username  AS creator_username,  -- NULL if orphaned/deleted account
  h.name               AS household_name
FROM expenses e
JOIN household_members hm ON hm.household_id = e.household_id
JOIN user_profiles     up ON up.id = hm.user_id AND up.username = 'dmetcalf'
JOIN households        h  ON h.id  = e.household_id
LEFT JOIN user_profiles up_creator ON up_creator.id = e.created_by
ORDER BY e.expense_date DESC
LIMIT 100;

-- ── STEP 2: isolate the orphaned rows ───────────────────────────────────────

-- These are expenses in dmetcalf's household(s) that he CANNOT see:
--   A) created_by IS NULL
--   B) created_by points to an auth.users row that no longer exists
--      (deleted account → new account with different UUID)
SELECT
  e.id,
  e.expense_date,
  e.vendor,
  e.total,
  e.created_by                          AS orphaned_created_by,
  CASE
    WHEN e.created_by IS NULL THEN 'NULL created_by'
    ELSE 'stale UUID — auth user deleted'
  END                                   AS failure_mode,
  h.name                                AS household_name
FROM expenses e
JOIN household_members hm ON hm.household_id = e.household_id
JOIN user_profiles     up ON up.id = hm.user_id AND up.username = 'dmetcalf'
JOIN households        h  ON h.id  = e.household_id
LEFT JOIN auth.users   au ON au.id  = e.created_by
WHERE e.created_by IS NULL OR au.id IS NULL
ORDER BY e.expense_date DESC;

-- ── STEP 3: verify before patching ─────────────────────────────────────────

-- Count of orphaned expenses to be claimed.  Review the list in STEP 2
-- before running the UPDATE below.
SELECT COUNT(*) AS orphaned_expense_count
FROM expenses e
JOIN household_members hm ON hm.household_id = e.household_id
JOIN user_profiles     up ON up.id = hm.user_id AND up.username = 'dmetcalf'
LEFT JOIN auth.users   au ON au.id  = e.created_by
WHERE e.created_by IS NULL OR au.id IS NULL;

-- ── STEP 4: RECOVERY — reassign orphaned expenses to dmetcalf ───────────────
-- ⚠️  Only run this after confirming STEP 2 shows the right rows.
-- The subquery pulls dmetcalf's current auth UUID dynamically.

UPDATE expenses
SET created_by = (
  SELECT up.id FROM user_profiles up WHERE up.username = 'dmetcalf'
)
WHERE id IN (
  SELECT e.id
  FROM expenses e
  JOIN household_members hm ON hm.household_id = e.household_id
  JOIN user_profiles     up ON up.id = hm.user_id AND up.username = 'dmetcalf'
  LEFT JOIN auth.users   au ON au.id  = e.created_by
  WHERE e.created_by IS NULL OR au.id IS NULL
);

-- ── STEP 5: VALIDATE — confirm dmetcalf can now see all his expenses ─────────

-- Should return 0 orphaned rows after recovery.
SELECT COUNT(*) AS remaining_orphans
FROM expenses e
JOIN household_members hm ON hm.household_id = e.household_id
JOIN user_profiles     up ON up.id = hm.user_id AND up.username = 'dmetcalf'
LEFT JOIN auth.users   au ON au.id  = e.created_by
WHERE e.created_by IS NULL OR au.id IS NULL;

-- dmetcalf's full visible set (what the dashboard will now show him):
SELECT
  e.expense_date,
  e.vendor,
  e.total,
  e.currency,
  e.category,
  h.name AS household_name
FROM expenses e
JOIN household_members hm ON hm.household_id = e.household_id
JOIN user_profiles     up ON up.id = hm.user_id AND up.username = 'dmetcalf'
JOIN households        h  ON h.id  = e.household_id
WHERE e.created_by = (SELECT up2.id FROM user_profiles up2 WHERE up2.username = 'dmetcalf')
ORDER BY e.expense_date DESC;

-- ── STEP 6: validate the NOT VALID constraint added by the migration ─────────
-- Run this after recovery confirms 0 NULLs remain.
-- ALTER TABLE expenses VALIDATE CONSTRAINT expenses_created_by_not_null;

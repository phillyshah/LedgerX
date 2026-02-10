/*
  # Fix Categories RLS for Global Categories

  ## Changes
  
  ### 1. Update Categories SELECT Policy
  - Allow users to view categories where they are household members
  - Also allow users to view global categories (household_id IS NULL)
  
  ## Notes
  - This fixes the issue where only "uncategorized" shows up when editing transactions
  - Global categories should be visible to all authenticated users
*/

-- Drop and recreate categories policy to include global categories
DROP POLICY IF EXISTS "Users can view categories" ON categories;
CREATE POLICY "Users can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (
    household_id IS NULL
    OR EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = categories.household_id
      AND household_members.user_id = (select auth.uid())
    )
  );

/*
  # Fix Admin Category Visibility

  ## Changes
  
  ### Categories Table - Fix SELECT Policy
  - Admins can now view ALL categories (both global and household-specific)
  - Regular users can only view global categories and categories for their households
  
  ## Security Notes
  - Admins need full visibility to manage categories across all households
  - Regular users remain restricted to their authorized categories
  - RLS remains enabled on categories table
*/

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view available categories" ON categories;

-- Create new consolidated policy that allows admins to see everything
CREATE POLICY "Users can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (
    -- Admins can view all categories
    is_admin()
    OR
    -- Regular users can view global categories
    household_id IS NULL
    OR
    -- Regular users can view categories for their households
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = categories.household_id
      AND household_members.user_id = auth.uid()
    )
  );

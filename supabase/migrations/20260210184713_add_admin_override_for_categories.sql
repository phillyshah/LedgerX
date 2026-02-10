/*
  # Add Admin Override for Categories Visibility
  
  ## Changes
  
  ### 1. Update Categories SELECT Policy
  - Allow admins to view ALL categories (global and household-specific)
  - Regular users can view global categories and categories for their households
  
  ## Notes
  - This fixes the admin interface showing only global categories
  - Admins need to see all household categories to manage them properly
*/

-- Drop and recreate categories SELECT policy with admin override
DROP POLICY IF EXISTS "Users can view categories" ON categories;

CREATE POLICY "Users can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (
    -- Admins can see all categories
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.is_admin = true
    )
    -- Regular users can see global categories and their household categories
    OR household_id IS NULL
    OR EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = categories.household_id
      AND household_members.user_id = auth.uid()
    )
  );

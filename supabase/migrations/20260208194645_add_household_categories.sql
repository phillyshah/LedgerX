/*
  # Add Household-Specific Categories
  
  1. Changes
    - Add household_id column to categories table (nullable)
    - NULL household_id means the category is global (available to all households)
    - Non-NULL household_id means the category is specific to that household
  
  2. Security
    - Update RLS policies to allow users to see:
      - Global categories (household_id IS NULL)
      - Categories for households they belong to
    - Only admins can create/update categories
  
  3. Functions
    - admin_assign_category_to_household: Assign a category to a specific household
    - admin_make_category_global: Make a category global (remove household assignment)
*/

-- Add household_id column to categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'household_id'
  ) THEN
    ALTER TABLE categories ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view categories" ON categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON categories;
DROP POLICY IF EXISTS "Admins can insert categories" ON categories;
DROP POLICY IF EXISTS "Admins can update categories" ON categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON categories;

-- Allow users to view global categories and categories for their households
CREATE POLICY "Users can view available categories"
  ON categories FOR SELECT
  TO authenticated
  USING (
    household_id IS NULL
    OR
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = categories.household_id
      AND household_members.user_id = auth.uid()
    )
  );

-- Admins can insert categories
CREATE POLICY "Admins can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.is_admin = true
    )
  );

-- Admins can update categories
CREATE POLICY "Admins can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.is_admin = true
    )
  );

-- Admins can delete categories
CREATE POLICY "Admins can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.is_admin = true
    )
  );

-- Function to assign category to household
CREATE OR REPLACE FUNCTION admin_assign_category_to_household(
  p_category_id uuid,
  p_household_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can assign categories to households';
  END IF;

  -- Update category
  UPDATE categories
  SET household_id = p_household_id
  WHERE id = p_category_id;
END;
$$;

-- Function to make category global
CREATE OR REPLACE FUNCTION admin_make_category_global(
  p_category_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can make categories global';
  END IF;

  -- Update category
  UPDATE categories
  SET household_id = NULL
  WHERE id = p_category_id;
END;
$$;
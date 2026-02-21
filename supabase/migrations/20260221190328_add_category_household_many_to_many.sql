/*
  # Add Many-to-Many Relationship for Categories and Households

  1. Changes
    - Create `category_households` junction table to allow categories to be assigned to multiple households
    - Migrate existing data from `categories.household_id` to the new junction table
    - Add RLS policies for the new junction table
    - Create helper functions for managing category-household assignments

  2. Security
    - Enable RLS on `category_households` table
    - Add policies for admins to manage assignments
    - Add policies for users to view categories available to their households
*/

-- Create the junction table
CREATE TABLE IF NOT EXISTS category_households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(category_id, household_id)
);

-- Migrate existing data from categories.household_id to category_households
INSERT INTO category_households (category_id, household_id)
SELECT id, household_id
FROM categories
WHERE household_id IS NOT NULL
ON CONFLICT (category_id, household_id) DO NOTHING;

-- Enable RLS
ALTER TABLE category_households ENABLE ROW LEVEL SECURITY;

-- RLS Policies for category_households
CREATE POLICY "Admins can view all category-household assignments"
  ON category_households FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert category-household assignments"
  ON category_households FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete category-household assignments"
  ON category_households FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.is_admin = true
    )
  );

CREATE POLICY "Users can view category-household assignments for their households"
  ON category_households FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = category_households.household_id
      AND household_members.user_id = auth.uid()
    )
  );

-- Drop the old admin functions since we'll replace them
DROP FUNCTION IF EXISTS admin_assign_category_to_household(uuid, uuid);
DROP FUNCTION IF EXISTS admin_make_category_global(uuid);

-- Create new admin function to set category households (replaces both old functions)
CREATE OR REPLACE FUNCTION admin_set_category_households(
  p_category_id uuid,
  p_household_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can assign categories to households';
  END IF;

  -- Check if category exists
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  -- Clear existing household assignments
  DELETE FROM category_households WHERE category_id = p_category_id;

  -- Clear the old household_id field (for backwards compatibility)
  UPDATE categories SET household_id = NULL WHERE id = p_category_id;

  -- If household_ids is empty or null, category becomes global (no assignments)
  IF p_household_ids IS NULL OR array_length(p_household_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Insert new assignments
  INSERT INTO category_households (category_id, household_id)
  SELECT p_category_id, unnest(p_household_ids)
  ON CONFLICT (category_id, household_id) DO NOTHING;

  -- For backwards compatibility, if only one household, set household_id
  IF array_length(p_household_ids, 1) = 1 THEN
    UPDATE categories 
    SET household_id = p_household_ids[1] 
    WHERE id = p_category_id;
  END IF;
END;
$$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_category_households_category_id ON category_households(category_id);
CREATE INDEX IF NOT EXISTS idx_category_households_household_id ON category_households(household_id);

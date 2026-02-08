/*
  # Add delete and uncategorized support

  1. Schema Changes
    - Make `household_id` nullable in expenses table to support orphaned transactions
    - Add index for faster uncategorized queries

  2. New Functions
    - `admin_delete_household(p_household_id uuid)` - Safely delete household and orphan its expenses
    - `admin_get_uncategorized_expenses()` - Get all expenses with invalid household or category
    - `admin_reallocate_expense(p_expense_id uuid, p_new_household_id uuid, p_new_category text)` - Re-allocate expense
    - `admin_update_user_role(p_user_id uuid, p_is_admin boolean)` - Manage user admin status
    - `admin_delete_user(p_user_id uuid)` - Delete a user account

  3. Security
    - All functions require admin privileges
    - RLS updated to handle NULL household_id
*/

-- Make household_id nullable in expenses
ALTER TABLE expenses ALTER COLUMN household_id DROP NOT NULL;

-- Create index for faster uncategorized queries
CREATE INDEX IF NOT EXISTS idx_expenses_household_null ON expenses(id) WHERE household_id IS NULL;

-- Function to safely delete household (orphans expenses instead of deleting them)
CREATE OR REPLACE FUNCTION admin_delete_household(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can delete households';
  END IF;

  -- Orphan all expenses in this household
  UPDATE expenses SET household_id = NULL WHERE household_id = p_household_id;

  -- Delete household members
  DELETE FROM household_members WHERE household_id = p_household_id;

  -- Delete the household
  DELETE FROM households WHERE id = p_household_id;
END;
$$;

-- Function to get uncategorized expenses (NULL household or invalid category)
CREATE OR REPLACE FUNCTION admin_get_uncategorized_expenses()
RETURNS TABLE (
  id uuid,
  household_id uuid,
  household_name text,
  created_by uuid,
  creator_email text,
  expense_date date,
  vendor text,
  total numeric,
  currency text,
  category text,
  notes text,
  image_path text,
  image_mime text,
  image_width integer,
  image_height integer,
  created_at timestamptz,
  updated_at timestamptz,
  is_orphaned_household boolean,
  is_invalid_category boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can view uncategorized expenses';
  END IF;

  RETURN QUERY
  SELECT 
    e.id,
    e.household_id,
    h.name as household_name,
    e.created_by,
    au.email::text as creator_email,
    e.expense_date::date,
    e.vendor,
    e.total,
    e.currency,
    e.category,
    e.notes,
    e.image_path,
    e.image_mime,
    e.image_width,
    e.image_height,
    e.created_at,
    e.updated_at,
    (e.household_id IS NULL) as is_orphaned_household,
    (e.category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = e.category)) as is_invalid_category
  FROM expenses e
  LEFT JOIN households h ON e.household_id = h.id
  LEFT JOIN auth.users au ON e.created_by = au.id
  WHERE 
    e.household_id IS NULL 
    OR (e.category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = e.category))
  ORDER BY e.expense_date DESC, e.created_at DESC;
END;
$$;

-- Function to re-allocate expense to valid household and/or category
CREATE OR REPLACE FUNCTION admin_reallocate_expense(
  p_expense_id uuid,
  p_new_household_id uuid DEFAULT NULL,
  p_new_category text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can reallocate expenses';
  END IF;

  -- Validate household exists if provided
  IF p_new_household_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM households WHERE id = p_new_household_id) THEN
    RAISE EXCEPTION 'Household does not exist';
  END IF;

  -- Validate category exists if provided
  IF p_new_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories WHERE name = p_new_category) THEN
    RAISE EXCEPTION 'Category does not exist';
  END IF;

  -- Update the expense
  UPDATE expenses
  SET 
    household_id = COALESCE(p_new_household_id, household_id),
    category = COALESCE(p_new_category, category),
    updated_at = now()
  WHERE id = p_expense_id;
END;
$$;

-- Function to update user admin status
CREATE OR REPLACE FUNCTION admin_update_user_role(p_user_id uuid, p_is_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can update user roles';
  END IF;

  -- Prevent removing own admin status
  IF p_user_id = auth.uid() AND p_is_admin = false THEN
    RAISE EXCEPTION 'Cannot remove your own admin status';
  END IF;

  INSERT INTO user_roles (user_id, is_admin)
  VALUES (p_user_id, p_is_admin)
  ON CONFLICT (user_id)
  DO UPDATE SET is_admin = p_is_admin;
END;
$$;

-- Function to delete user (admin only)
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  -- Prevent self-deletion
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Orphan all expenses created by this user
  UPDATE expenses SET household_id = NULL WHERE created_by = p_user_id;

  -- Remove from all households
  DELETE FROM household_members WHERE user_id = p_user_id;

  -- Remove roles
  DELETE FROM user_roles WHERE user_id = p_user_id;

  -- Delete exports
  DELETE FROM exports WHERE requested_by = p_user_id;

  -- Note: Cannot delete from auth.users directly via SQL
  -- This would need to be done via Supabase Admin API
  -- For now, we just clean up all related data
END;
$$;

-- Update RLS policy for expenses to allow admins to see orphaned expenses
CREATE POLICY "Admins can update all expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
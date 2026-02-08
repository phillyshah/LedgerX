/*
  # Fix Security and Performance Issues

  1. Performance Improvements
    - Add indexes for foreign keys:
      - categories.household_id
      - expenses.created_by
      - exports.household_id
      - exports.requested_by
      - household_members.user_id
    - Remove unused indexes:
      - expenses_household_vendor_idx
      - idx_expenses_household_null

  2. RLS Policy Optimization
    - Update all RLS policies to use (select auth.uid()) pattern for better performance
    - This prevents re-evaluation of auth.uid() for each row

  3. Function Security
    - Set search_path for all functions to prevent search path injection attacks
    
  4. Notes
    - Multiple permissive policies are intentional (admin OR regular user access patterns)
    - Leaked password protection must be enabled in Supabase Auth settings (cannot be done via SQL)
*/

-- ============================================================================
-- 1. Add Missing Indexes for Foreign Keys
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_categories_household_id ON categories(household_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_exports_household_id ON exports(household_id);
CREATE INDEX IF NOT EXISTS idx_exports_requested_by ON exports(requested_by);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);

-- ============================================================================
-- 2. Remove Unused Indexes
-- ============================================================================

DROP INDEX IF EXISTS expenses_household_vendor_idx;
DROP INDEX IF EXISTS idx_expenses_household_null;

-- ============================================================================
-- 3. Optimize RLS Policies - Categories Table
-- ============================================================================

DROP POLICY IF EXISTS "Users can view available categories" ON categories;
DROP POLICY IF EXISTS "Admins can insert categories" ON categories;
DROP POLICY IF EXISTS "Admins can update categories" ON categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON categories;
DROP POLICY IF EXISTS "All authenticated users can view categories" ON categories;
DROP POLICY IF EXISTS "Admins can create categories" ON categories;

CREATE POLICY "Users can view available categories"
  ON categories FOR SELECT
  TO authenticated
  USING (
    household_id IS NULL
    OR
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = categories.household_id
      AND household_members.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Admins can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid())
      AND user_roles.is_admin = true
    )
  );

CREATE POLICY "Admins can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid())
      AND user_roles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid())
      AND user_roles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid())
      AND user_roles.is_admin = true
    )
  );

-- ============================================================================
-- 4. Optimize RLS Policies - Expenses Table
-- ============================================================================

DROP POLICY IF EXISTS "Household members can create expenses" ON expenses;

CREATE POLICY "Household members can create expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = expenses.household_id
      AND household_members.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- 5. Optimize RLS Policies - Exports Table
-- ============================================================================

DROP POLICY IF EXISTS "Admins can create exports" ON exports;
DROP POLICY IF EXISTS "Household members can create exports" ON exports;

CREATE POLICY "Admins can create exports"
  ON exports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid())
      AND user_roles.is_admin = true
    )
  );

CREATE POLICY "Household members can create exports"
  ON exports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = exports.household_id
      AND household_members.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- 6. Optimize RLS Policies - Household Members Table
-- ============================================================================

DROP POLICY IF EXISTS "Users can add themselves to households" ON household_members;
DROP POLICY IF EXISTS "Users can remove themselves or owners can remove members" ON household_members;

CREATE POLICY "Users can add themselves to households"
  ON household_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can remove themselves or owners can remove members"
  ON household_members FOR DELETE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM household_members owners
      WHERE owners.household_id = household_members.household_id
      AND owners.user_id = (select auth.uid())
      AND owners.role = 'owner'
    )
  );

-- ============================================================================
-- 7. Optimize RLS Policies - User Roles Table
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own role" ON user_roles;

CREATE POLICY "Users can view own role"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- 8. Fix Function Search Path - generate_pic_id
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_pic_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id text;
  exists boolean;
BEGIN
  LOOP
    new_id := LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
    
    SELECT EXISTS(SELECT 1 FROM expenses WHERE pic_id = new_id) INTO exists;
    
    IF NOT exists THEN
      RETURN new_id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 9. Fix Function Search Path - set_pic_id
-- ============================================================================

CREATE OR REPLACE FUNCTION set_pic_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pic_id IS NULL THEN
    NEW.pic_id := generate_pic_id();
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 10. Fix Function Search Path - admin_make_category_global
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_make_category_global(
  p_category_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can make categories global';
  END IF;

  UPDATE categories
  SET household_id = NULL
  WHERE id = p_category_id;
END;
$$;

-- ============================================================================
-- 11. Fix Function Search Path - admin_assign_category_to_household
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_assign_category_to_household(
  p_category_id uuid,
  p_household_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can assign categories to households';
  END IF;

  UPDATE categories
  SET household_id = p_household_id
  WHERE id = p_category_id;
END;
$$;
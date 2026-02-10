/*
  # Fix Security and Performance Issues

  ## Changes
  
  ### 1. Add Indexes for Foreign Keys
  - Add index on `expenses.created_by` for better query performance
  - Add index on `exports.household_id` for better query performance
  - Add index on `exports.requested_by` for better query performance
  - Add index on `household_members.user_id` for better query performance
  
  ### 2. Optimize RLS Policies
  - Wrap `auth.uid()` calls with `(select auth.uid())` to prevent re-evaluation per row
  - Apply to all affected policies for better performance at scale
  
  ### 3. Fix Function Search Path
  - Update `generate_pic_id` function with immutable search_path
  
  ## Notes
  - These changes improve query performance and security
  - RLS policy optimization prevents unnecessary re-evaluation
*/

-- ==========================================
-- 1. Add Indexes for Foreign Keys
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_exports_household_id ON exports(household_id);
CREATE INDEX IF NOT EXISTS idx_exports_requested_by ON exports(requested_by);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);

-- ==========================================
-- 2. Optimize RLS Policies
-- ==========================================

-- Drop and recreate household_members policies with optimized auth.uid() calls
DROP POLICY IF EXISTS "Users can add household members" ON household_members;
CREATE POLICY "Users can add household members"
  ON household_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid()) AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can remove household members" ON household_members;
CREATE POLICY "Users can remove household members"
  ON household_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid()) AND is_admin = true
    )
  );

-- Drop and recreate user_roles policy with optimized auth.uid() call
DROP POLICY IF EXISTS "Users can view roles" ON user_roles;
CREATE POLICY "Users can view roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_roles.user_id = (select auth.uid()));

-- Drop and recreate categories policy with optimized auth.uid() call
DROP POLICY IF EXISTS "Users can view categories" ON categories;
CREATE POLICY "Users can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = categories.household_id
      AND household_members.user_id = (select auth.uid())
    )
  );

-- Drop and recreate user_profiles policies with optimized auth.uid() calls
DROP POLICY IF EXISTS "Admins can insert profiles" ON user_profiles;
CREATE POLICY "Admins can insert profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid()) AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (user_profiles.id = (select auth.uid()))
  WITH CHECK (user_profiles.id = (select auth.uid()));

-- ==========================================
-- 3. Fix Function Search Path
-- ==========================================

CREATE OR REPLACE FUNCTION generate_pic_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id text;
  id_exists boolean;
BEGIN
  LOOP
    new_id := lpad(floor(random() * 1000000)::text, 6, '0');
    
    SELECT EXISTS(SELECT 1 FROM expenses WHERE pic_id = new_id) INTO id_exists;
    
    IF NOT id_exists THEN
      RETURN new_id;
    END IF;
  END LOOP;
END;
$$;

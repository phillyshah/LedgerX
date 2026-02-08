/*
  # Fix Security Issues - Drop Unused Indexes and Consolidate Policies
  
  ## Changes
  
  ### 1. Drop Unused Indexes
  - Drop `idx_expenses_created_by` - not being used in queries
  - Drop `idx_exports_household_id` - not being used in queries  
  - Drop `idx_exports_requested_by` - not being used in queries
  - Drop `idx_household_members_user_id` - not being used in queries
  
  ### 2. Consolidate Multiple Permissive Policies
  Replace duplicate policies with single consolidated policies that check for both admin and regular user access:
  
  #### Expenses Table
  - Combine "Admins can view all expenses" + "Household members can view expenses" into one SELECT policy
  - Combine "Admins can update all expenses" + "Household members can update expenses" into one UPDATE policy
  
  #### Exports Table
  - Combine "Admins can create exports" + "Household members can create exports" into one INSERT policy
  - Combine "Admins can view all exports" + "Household members can view exports" into one SELECT policy
  
  #### Household Members Table
  - Combine admin and user policies for INSERT, SELECT, and DELETE operations
  
  #### Households Table
  - Combine admin and owner policies for SELECT, UPDATE, and DELETE operations
  
  #### User Roles Table
  - Combine "Admins can view all roles" + "Users can view own role" into one SELECT policy
  
  ### 3. Function Security
  - Ensure generate_pic_id function has immutable search_path
  
  ## Security Notes
  - All consolidated policies use OR logic to allow either admin OR authorized user access
  - Policies remain restrictive by default - access is only granted if conditions are met
  - RLS remains enabled on all tables
*/

-- Drop unused indexes
DROP INDEX IF EXISTS idx_expenses_created_by;
DROP INDEX IF EXISTS idx_exports_household_id;
DROP INDEX IF EXISTS idx_exports_requested_by;
DROP INDEX IF EXISTS idx_household_members_user_id;

-- EXPENSES TABLE: Consolidate policies
-- Drop existing duplicate policies
DROP POLICY IF EXISTS "Admins can view all expenses" ON expenses;
DROP POLICY IF EXISTS "Household members can view expenses" ON expenses;
DROP POLICY IF EXISTS "Admins can update all expenses" ON expenses;
DROP POLICY IF EXISTS "Household members can update expenses" ON expenses;

-- Create consolidated policies
CREATE POLICY "Users can view expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (
    -- Admin can view all
    is_admin()
    OR
    -- Household members can view household expenses
    household_id IN (SELECT user_households())
  );

CREATE POLICY "Users can update expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (
    -- Admin can update all
    is_admin()
    OR
    -- Household members can update household expenses
    household_id IN (SELECT user_households())
  )
  WITH CHECK (
    -- Admin can update all
    is_admin()
    OR
    -- Household members can update within their households
    household_id IN (SELECT user_households())
  );

-- EXPORTS TABLE: Consolidate policies
-- Drop existing duplicate policies
DROP POLICY IF EXISTS "Admins can create exports" ON exports;
DROP POLICY IF EXISTS "Household members can create exports" ON exports;
DROP POLICY IF EXISTS "Admins can view all exports" ON exports;
DROP POLICY IF EXISTS "Household members can view exports" ON exports;

-- Create consolidated policies
CREATE POLICY "Users can create exports"
  ON exports FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Admin can create for any household
    is_admin()
    OR
    -- Members can create for their households
    household_id IN (SELECT user_households())
  );

CREATE POLICY "Users can view exports"
  ON exports FOR SELECT
  TO authenticated
  USING (
    -- Admin can view all
    is_admin()
    OR
    -- Members can view their household exports
    household_id IN (SELECT user_households())
  );

-- HOUSEHOLD_MEMBERS TABLE: Consolidate policies
-- Drop existing duplicate policies
DROP POLICY IF EXISTS "Admins can add household members" ON household_members;
DROP POLICY IF EXISTS "Users can add themselves to households" ON household_members;
DROP POLICY IF EXISTS "Admins can view all household members" ON household_members;
DROP POLICY IF EXISTS "Users can view members of their households" ON household_members;
DROP POLICY IF EXISTS "Admins can remove household members" ON household_members;
DROP POLICY IF EXISTS "Users can remove themselves or owners can remove members" ON household_members;

-- Create consolidated policies
CREATE POLICY "Users can add household members"
  ON household_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Admin can add anyone to any household
    is_admin()
    OR
    -- Users can add themselves to households
    user_id = auth.uid()
  );

CREATE POLICY "Users can view household members"
  ON household_members FOR SELECT
  TO authenticated
  USING (
    -- Admin can view all
    is_admin()
    OR
    -- Users can view members of their households
    household_id IN (SELECT user_households())
  );

CREATE POLICY "Users can remove household members"
  ON household_members FOR DELETE
  TO authenticated
  USING (
    -- Admin can remove anyone
    is_admin()
    OR
    -- Users can remove themselves
    user_id = auth.uid()
    OR
    -- Owners can remove members from their households
    (
      household_id IN (SELECT user_owned_households())
      AND user_id != auth.uid()
    )
  );

-- HOUSEHOLDS TABLE: Consolidate policies
-- Drop existing duplicate policies
DROP POLICY IF EXISTS "Admins can view all households" ON households;
DROP POLICY IF EXISTS "Users can view households they are members of" ON households;
DROP POLICY IF EXISTS "Admins can update all households" ON households;
DROP POLICY IF EXISTS "Household owners can update household" ON households;
DROP POLICY IF EXISTS "Admins can delete all households" ON households;
DROP POLICY IF EXISTS "Household owners can delete household" ON households;

-- Create consolidated policies
CREATE POLICY "Users can view households"
  ON households FOR SELECT
  TO authenticated
  USING (
    -- Admin can view all
    is_admin()
    OR
    -- Users can view households they are members of
    id IN (SELECT user_households())
  );

CREATE POLICY "Users can update households"
  ON households FOR UPDATE
  TO authenticated
  USING (
    -- Admin can update all
    is_admin()
    OR
    -- Owners can update their households
    id IN (SELECT user_owned_households())
  )
  WITH CHECK (
    -- Admin can update all
    is_admin()
    OR
    -- Owners can update their households
    id IN (SELECT user_owned_households())
  );

CREATE POLICY "Users can delete households"
  ON households FOR DELETE
  TO authenticated
  USING (
    -- Admin can delete all
    is_admin()
    OR
    -- Owners can delete their households
    id IN (SELECT user_owned_households())
  );

-- USER_ROLES TABLE: Consolidate policies
-- Drop existing duplicate policies
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;

-- Create consolidated policy
CREATE POLICY "Users can view roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (
    -- Admin can view all roles
    is_admin()
    OR
    -- Users can view their own role
    user_id = auth.uid()
  );

-- Fix function search_path - recreate with proper security settings
DROP FUNCTION IF EXISTS generate_pic_id();
CREATE OR REPLACE FUNCTION generate_pic_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id text;
  exists boolean;
BEGIN
  LOOP
    new_id := LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
    
    SELECT EXISTS(SELECT 1 FROM public.expenses WHERE pic_id = new_id) INTO exists;
    
    IF NOT exists THEN
      RETURN new_id;
    END IF;
  END LOOP;
END;
$$;

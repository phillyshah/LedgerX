/*
  # Fix Infinite Recursion in RLS Policies

  This migration fixes the infinite recursion error by:
  1. Creating helper functions that use SECURITY DEFINER to safely query household_members
  2. Replacing all RLS policies to use these helper functions instead of direct subqueries
  
  Changes:
  - Adds `user_households()` function to get household IDs for current user
  - Adds `user_owned_households()` function to get owned household IDs
  - Replaces all RLS policies on all tables to use these functions
*/

-- Drop all existing policies first
DROP POLICY IF EXISTS "Users can view households they are members of" ON households;
DROP POLICY IF EXISTS "Users can create households" ON households;
DROP POLICY IF EXISTS "Household owners can update household" ON households;
DROP POLICY IF EXISTS "Household owners can delete household" ON households;

DROP POLICY IF EXISTS "Users can view members of their households" ON household_members;
DROP POLICY IF EXISTS "Users can add themselves to households" ON household_members;
DROP POLICY IF EXISTS "Household owners can update members" ON household_members;
DROP POLICY IF EXISTS "Users can remove themselves or owners can remove members" ON household_members;

DROP POLICY IF EXISTS "Household members can view expenses" ON expenses;
DROP POLICY IF EXISTS "Household members can create expenses" ON expenses;
DROP POLICY IF EXISTS "Household members can update expenses" ON expenses;
DROP POLICY IF EXISTS "Household members can delete expenses" ON expenses;

DROP POLICY IF EXISTS "Household members can view exports" ON exports;
DROP POLICY IF EXISTS "Household members can create exports" ON exports;
DROP POLICY IF EXISTS "Household members can update exports" ON exports;
DROP POLICY IF EXISTS "Household members can delete exports" ON exports;

-- Create helper functions to avoid infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION user_households()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT household_id FROM household_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION user_owned_households()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner'
$$;

-- RLS Policies for households table
CREATE POLICY "Users can view households they are members of"
  ON households FOR SELECT
  TO authenticated
  USING (id IN (SELECT user_households()));

CREATE POLICY "Users can create households"
  ON households FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Household owners can update household"
  ON households FOR UPDATE
  TO authenticated
  USING (id IN (SELECT user_owned_households()))
  WITH CHECK (id IN (SELECT user_owned_households()));

CREATE POLICY "Household owners can delete household"
  ON households FOR DELETE
  TO authenticated
  USING (id IN (SELECT user_owned_households()));

-- RLS Policies for household_members table
CREATE POLICY "Users can view members of their households"
  ON household_members FOR SELECT
  TO authenticated
  USING (household_id IN (SELECT user_households()));

CREATE POLICY "Users can add themselves to households"
  ON household_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Household owners can update members"
  ON household_members FOR UPDATE
  TO authenticated
  USING (household_id IN (SELECT user_owned_households()))
  WITH CHECK (household_id IN (SELECT user_owned_households()));

CREATE POLICY "Users can remove themselves or owners can remove members"
  ON household_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    household_id IN (SELECT user_owned_households())
  );

-- RLS Policies for expenses table
CREATE POLICY "Household members can view expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (household_id IN (SELECT user_households()));

CREATE POLICY "Household members can create expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    household_id IN (SELECT user_households())
  );

CREATE POLICY "Household members can update expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (household_id IN (SELECT user_households()))
  WITH CHECK (household_id IN (SELECT user_households()));

CREATE POLICY "Household members can delete expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (household_id IN (SELECT user_households()));

-- RLS Policies for exports table
CREATE POLICY "Household members can view exports"
  ON exports FOR SELECT
  TO authenticated
  USING (household_id IN (SELECT user_households()));

CREATE POLICY "Household members can create exports"
  ON exports FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid() AND
    household_id IN (SELECT user_households())
  );

CREATE POLICY "Household members can update exports"
  ON exports FOR UPDATE
  TO authenticated
  USING (household_id IN (SELECT user_households()))
  WITH CHECK (household_id IN (SELECT user_households()));

CREATE POLICY "Household members can delete exports"
  ON exports FOR DELETE
  TO authenticated
  USING (household_id IN (SELECT user_households()));

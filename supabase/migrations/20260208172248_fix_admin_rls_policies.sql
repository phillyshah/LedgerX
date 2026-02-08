/*
  # Fix Admin RLS Policies

  1. Changes
    - Add policy for admins to view all user roles
    - Add policy for admins to insert new user roles
    - These policies are needed for:
      - The is_admin() function to work properly
      - Admin users to be able to create new users
      - Admin users to be able to see all user roles in the management UI
  
  2. Security
    - SELECT policy: Only users who are already marked as admin can view all roles
    - INSERT policy: Only admins can create new user roles
*/

-- Drop existing policies if they exist and recreate them
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
  DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
END $$;

-- Allow admins to view all user roles
CREATE POLICY "Admins can view all roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Allow admins to insert new user roles
CREATE POLICY "Admins can insert roles"
  ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

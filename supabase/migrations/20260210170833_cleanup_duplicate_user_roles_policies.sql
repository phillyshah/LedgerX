/*
  # Clean Up Duplicate User Roles Policies

  ## Changes
  
  ### 1. Remove Duplicate Policies
  - Remove duplicate INSERT, UPDATE, DELETE policies on user_roles
  - Keep only one set of policies that work correctly
  
  ## Notes
  - Service role bypasses RLS anyway, so these policies are for authenticated user operations
  - Consolidating to avoid conflicts
*/

-- Drop duplicate policies
DROP POLICY IF EXISTS "Service role can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can update roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can delete roles" ON user_roles;

-- Ensure the remaining policies exist
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admin can manage roles" ON user_roles;

-- Create clean consolidated policies
CREATE POLICY "Admins can insert roles"
  ON user_roles FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update roles"
  ON user_roles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete roles"
  ON user_roles FOR DELETE
  TO authenticated
  USING (is_admin());

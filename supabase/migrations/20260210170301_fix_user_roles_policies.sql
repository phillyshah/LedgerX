/*
  # Fix User Roles Policies

  ## Changes
  
  ### 1. Add Missing Policies for user_roles
  - Add INSERT policy for admin operations
  - Add UPDATE policy for admin operations  
  - Add DELETE policy for admin operations
  
  ## Notes
  - These policies ensure that admin operations on user_roles table work correctly
  - Service role operations bypass RLS, but adding these for completeness
*/

-- Add INSERT policy for user_roles (for creating new user roles)
CREATE POLICY "Service role can insert roles"
  ON user_roles FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Add UPDATE policy for user_roles (for updating admin status)
CREATE POLICY "Service role can update roles"
  ON user_roles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Add DELETE policy for user_roles (for removing user roles)
CREATE POLICY "Service role can delete roles"
  ON user_roles FOR DELETE
  TO authenticated
  USING (is_admin());

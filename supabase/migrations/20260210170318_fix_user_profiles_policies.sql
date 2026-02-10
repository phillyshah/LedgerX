/*
  # Fix User Profiles Policies

  ## Changes
  
  ### 1. Add Missing Policies for user_profiles
  - Add INSERT policy for admin and trigger operations
  - Add DELETE policy for admin operations
  
  ## Notes
  - These policies ensure that admin operations and trigger operations work correctly
  - INSERT is needed for manual profile creation and trigger operations
  - DELETE is needed for user deletion operations
*/

-- Add INSERT policy for user_profiles (for creating profiles)
CREATE POLICY "Admins can insert profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_admin() OR id = auth.uid());

-- Add DELETE policy for user_profiles (for deleting profiles)
CREATE POLICY "Admins can delete profiles"
  ON user_profiles FOR DELETE
  TO authenticated
  USING (is_admin());

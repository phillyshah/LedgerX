/*
  # Remove Email Addresses and Use Username System

  ## Changes
  
  ### 1. Update admin_list_users Function
  - Drop and recreate to return username from user_profiles instead of email from auth.users
  - Join with user_profiles table to get username
  
  ### 2. Add New Function for Adding Household Members by User ID
  - `admin_add_household_member_by_id(p_household_id uuid, p_user_id uuid, p_role text)`
  - Takes user_id directly instead of email lookup
  
  ## Notes
  - This enables a dropdown-based user selection UI
  - Removes dependency on email addresses throughout the admin interface
  - Users are now identified by username instead of email
*/

-- Drop and recreate admin_list_users to return username instead of email
DROP FUNCTION IF EXISTS admin_list_users();

CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (id uuid, username text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    au.id, 
    COALESCE(up.username, 'No Username')::text as username,
    au.created_at
  FROM auth.users au
  LEFT JOIN user_profiles up ON up.id = au.id
  WHERE EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_admin = true)
  ORDER BY up.username ASC, au.created_at DESC
$$;

-- Add new function to add household member by user_id
CREATE OR REPLACE FUNCTION admin_add_household_member_by_id(
  p_household_id uuid, 
  p_user_id uuid, 
  p_role text DEFAULT 'member'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_member_id uuid;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can manage household members';
  END IF;

  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Insert household member
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (p_household_id, p_user_id, p_role)
  ON CONFLICT (household_id, user_id) DO NOTHING
  RETURNING household_members.id INTO new_member_id;

  RETURN new_member_id;
END;
$$;

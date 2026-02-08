/*
  # Add function to create household with member

  1. New Functions
    - `create_household_with_owner(household_name text)` - Creates a household and adds the calling user as owner
    
  2. Security
    - Function uses SECURITY DEFINER to bypass RLS temporarily
    - Only creates household and adds the authenticated user as owner
    - Returns the created household
*/

CREATE OR REPLACE FUNCTION create_household_with_owner(household_name text)
RETURNS TABLE (id uuid, name text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id uuid;
BEGIN
  -- Create the household
  INSERT INTO households (name)
  VALUES (household_name)
  RETURNING households.id, households.name, households.created_at
  INTO id, name, created_at;
  
  new_household_id := id;
  
  -- Add the user as owner
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (new_household_id, auth.uid(), 'owner');
  
  RETURN NEXT;
END;
$$;

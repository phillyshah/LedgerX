/*
  # Auto-Assign New Users to All Households

  ## Changes
  
  ### 1. Trigger Function
  - Create a trigger function that automatically adds new users to all existing households
  - Trigger fires after a new user is created in auth.users
  
  ### 2. Security
  - Function uses SECURITY DEFINER to bypass RLS
  - Adds user to all households when they sign up
  
  ## Notes
  - New users will be assigned to all households automatically
  - This ensures users have immediate access to all household data
*/

-- Create function to auto-assign users to all households
CREATE OR REPLACE FUNCTION auto_assign_user_to_households()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Add user to all existing households
  INSERT INTO public.household_members (household_id, user_id)
  SELECT id, NEW.id
  FROM public.households
  ON CONFLICT (household_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created_assign_households ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created_assign_households
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_user_to_households();

/*
  # Fix Category Assignment Functions Security

  ## Changes
  
  ### Security Improvements
  - Add search_path to SECURITY DEFINER functions to prevent search_path attacks
  - Recreate admin_assign_category_to_household with proper security settings
  - Recreate admin_make_category_global with proper security settings
  
  ## Security Notes
  - SECURITY DEFINER functions must have explicit search_path set
  - This prevents malicious users from hijacking function calls
*/

-- Recreate admin_assign_category_to_household with proper security
DROP FUNCTION IF EXISTS admin_assign_category_to_household(uuid, uuid);
CREATE OR REPLACE FUNCTION admin_assign_category_to_household(
  p_category_id uuid,
  p_household_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can assign categories to households';
  END IF;

  UPDATE public.categories
  SET household_id = p_household_id
  WHERE id = p_category_id;
END;
$$;

-- Recreate admin_make_category_global with proper security
DROP FUNCTION IF EXISTS admin_make_category_global(uuid);
CREATE OR REPLACE FUNCTION admin_make_category_global(
  p_category_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can make categories global';
  END IF;

  UPDATE public.categories
  SET household_id = NULL
  WHERE id = p_category_id;
END;
$$;

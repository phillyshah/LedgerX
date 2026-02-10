/*
  # Fix Security and Performance Issues

  ## Changes

  ### 1. Performance: Optimize Categories RLS Policy
  - Wrap auth.uid() calls with SELECT to prevent re-evaluation for each row
  - This improves query performance at scale by computing auth.uid() once

  ### 2. Cleanup: Remove Unused Indexes
  - Drop `idx_expenses_created_by` - not being used
  - Drop `idx_exports_household_id` - not being used
  - Drop `idx_exports_requested_by` - not being used
  - Drop `idx_household_members_user_id` - not being used

  ### 3. Security: Fix Function Search Path
  - Update `generate_pic_id` function to use immutable search_path
  - Prevents search_path manipulation attacks

  ## Notes

  ### Leaked Password Protection
  The "Leaked Password Protection Disabled" warning refers to a Supabase Auth 
  dashboard setting that cannot be changed via SQL migrations. To enable this:
  1. Go to Supabase Dashboard > Authentication > Providers
  2. Enable "Password Protection" feature
  3. This will check passwords against HaveIBeenPwned.org database

  This migration handles all SQL-level security improvements.
*/

-- 1. Fix Categories RLS Policy for Performance
DROP POLICY IF EXISTS "Users can view categories" ON categories;

CREATE POLICY "Users can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (
    -- Admins can see all categories (compute auth.uid() once)
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (select auth.uid())
      AND user_roles.is_admin = true
    )
    -- Regular users can see global categories and their household categories
    OR household_id IS NULL
    OR EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = categories.household_id
      AND household_members.user_id = (select auth.uid())
    )
  );

-- 2. Drop Unused Indexes
DROP INDEX IF EXISTS idx_expenses_created_by;
DROP INDEX IF EXISTS idx_exports_household_id;
DROP INDEX IF EXISTS idx_exports_requested_by;
DROP INDEX IF EXISTS idx_household_members_user_id;

-- 3. Fix generate_pic_id Function Search Path
CREATE OR REPLACE FUNCTION generate_pic_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id text;
  id_exists boolean;
BEGIN
  LOOP
    new_id := lpad(floor(random() * 1000000)::text, 6, '0');
    
    SELECT EXISTS(SELECT 1 FROM public.expenses WHERE pic_id = new_id) INTO id_exists;
    
    IF NOT id_exists THEN
      RETURN new_id;
    END IF;
  END LOOP;
END;
$$;

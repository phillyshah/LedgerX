/*
  # Add Real Email Support and Password Reset

  ## Changes

  ### 1. Schema Changes
  - Add `real_email` (nullable, unique) column to `user_profiles`

  ### 2. Updated Functions
  - `get_user_email_by_username()` — returns `COALESCE(real_email, email)` so login
    automatically uses the real email once set
  - `create_user_profile()` trigger — stores `real_email` from signup metadata
  - New `get_real_email_by_username()` — returns only the real_email (for forgot-password flow)

  ## Notes
  - When a user sets their real email via the `update-user-email` edge function,
    it updates `user_profiles.email`, `user_profiles.real_email`, AND `auth.users.email`.
  - This means `resetPasswordForEmail()` works because `auth.users.email` is deliverable.
  - Existing users without a real_email continue to work — login falls back to the
    internal `@ledgerx.local` / `@example.com` address.
*/

-- Add real_email column
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS real_email text UNIQUE;

-- Update the login lookup to prefer real_email
CREATE OR REPLACE FUNCTION get_user_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_email text;
BEGIN
  SELECT COALESCE(real_email, email) INTO user_email
  FROM user_profiles
  WHERE LOWER(username) = LOWER(p_username);

  RETURN user_email;
END;
$$;

-- Lookup that returns only the real email (for forgot-password flow)
CREATE OR REPLACE FUNCTION get_real_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result_email text;
BEGIN
  SELECT real_email INTO result_email
  FROM user_profiles
  WHERE LOWER(username) = LOWER(p_username);

  RETURN result_email;
END;
$$;

-- Update trigger to store real_email from signup metadata
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username, email, real_email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      'user_' || substr(NEW.id::text, 1, 8)
    ),
    NEW.email,
    NEW.raw_user_meta_data->>'real_email'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

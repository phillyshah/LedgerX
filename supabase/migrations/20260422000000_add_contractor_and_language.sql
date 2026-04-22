/*
  # Add Contractor Role and Preferred Language

  ## Changes

  ### 1. Schema
  - `user_roles.is_contractor` (boolean, default false) — new global role flag.
  - `user_profiles.preferred_language` (text, default 'en', check in ('en','pt-BR')).

  ### 2. Functions
  - `is_contractor()` — RLS helper mirroring `is_admin()`.
  - `admin_update_user_role()` — extended to accept `p_is_contractor`.
  - `admin_update_user_language()` — new; admin sets preferred_language on any profile.
  - `admin_list_users()` — now also returns `is_contractor` and `preferred_language`.
  - `create_user_profile()` trigger — reads `preferred_language` from signup metadata.

  ## Notes
  - Contractor is mutually exclusive with admin at UI level; at DB level nothing
    forbids both being true, but callers should not set them simultaneously.
  - `admin_update_user_role` uses NULL sentinel on contractor to preserve the
    existing value if only admin toggling is desired.
*/

-- 1. Columns ----------------------------------------------------------------

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS is_contractor boolean NOT NULL DEFAULT false;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_preferred_language_check'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_preferred_language_check
      CHECK (preferred_language IN ('en', 'pt-BR'));
  END IF;
END $$;

-- 2. Helper functions -------------------------------------------------------

CREATE OR REPLACE FUNCTION is_contractor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT is_contractor FROM user_roles WHERE user_id = auth.uid()),
    false
  );
$$;

-- 3. Extend admin_update_user_role -----------------------------------------

DROP FUNCTION IF EXISTS admin_update_user_role(uuid, boolean);
DROP FUNCTION IF EXISTS admin_update_user_role(uuid, boolean, boolean);

CREATE OR REPLACE FUNCTION admin_update_user_role(
  p_user_id uuid,
  p_is_admin boolean,
  p_is_contractor boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can update user roles';
  END IF;

  INSERT INTO user_roles (user_id, is_admin, is_contractor)
  VALUES (p_user_id, p_is_admin, COALESCE(p_is_contractor, false))
  ON CONFLICT (user_id) DO UPDATE SET
    is_admin      = EXCLUDED.is_admin,
    is_contractor = COALESCE(p_is_contractor, user_roles.is_contractor);
END;
$$;

-- 4. Admin: set preferred_language on a user profile -----------------------

CREATE OR REPLACE FUNCTION admin_update_user_language(
  p_user_id uuid,
  p_language text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can update user language';
  END IF;

  IF p_language NOT IN ('en', 'pt-BR') THEN
    RAISE EXCEPTION 'Invalid language: %', p_language;
  END IF;

  UPDATE user_profiles SET preferred_language = p_language WHERE id = p_user_id;
END;
$$;

-- 5. admin_list_users now exposes role flags + language --------------------

DROP FUNCTION IF EXISTS admin_list_users();

CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  id uuid,
  username text,
  created_at timestamptz,
  is_admin boolean,
  is_contractor boolean,
  preferred_language text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    au.id,
    COALESCE(up.username, 'No Username')::text AS username,
    au.created_at,
    COALESCE(ur.is_admin, false)      AS is_admin,
    COALESCE(ur.is_contractor, false) AS is_contractor,
    COALESCE(up.preferred_language, 'en') AS preferred_language
  FROM auth.users au
  LEFT JOIN user_profiles up ON up.id = au.id
  LEFT JOIN user_roles ur    ON ur.user_id = au.id
  WHERE EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = auth.uid() AND x.is_admin = true)
  ORDER BY up.username ASC, au.created_at DESC;
$$;

-- 6. Profile-creation trigger reads preferred_language from signup metadata -

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username, email, real_email, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      'user_' || substr(NEW.id::text, 1, 8)
    ),
    NEW.email,
    NEW.raw_user_meta_data->>'real_email',
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

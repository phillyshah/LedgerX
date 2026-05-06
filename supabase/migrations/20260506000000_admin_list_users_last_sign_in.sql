-- Surface auth.users.last_sign_in_at on admin_list_users so the user
-- management screen can show when each account was last active.
--
-- auth.users is a privileged schema, so we keep going through the
-- SECURITY DEFINER RPC. This drops + recreates the function with the
-- same role/language columns plus the new last_sign_in_at field.

DROP FUNCTION IF EXISTS admin_list_users();

CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  id uuid,
  username text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin boolean,
  is_contractor boolean,
  is_household_admin boolean,
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
    au.last_sign_in_at,
    COALESCE(ur.is_admin, false)           AS is_admin,
    COALESCE(ur.is_contractor, false)      AS is_contractor,
    COALESCE(ur.is_household_admin, false) AS is_household_admin,
    COALESCE(up.preferred_language, 'en')  AS preferred_language
  FROM auth.users au
  LEFT JOIN user_profiles up ON up.id = au.id
  LEFT JOIN user_roles ur    ON ur.user_id = au.id
  WHERE EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = auth.uid() AND x.is_admin = true)
  ORDER BY up.username ASC, au.created_at DESC;
$$;

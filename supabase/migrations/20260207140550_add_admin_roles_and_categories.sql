/*
  # Admin roles, categories, and access control

  1. New Tables
    - `user_roles` - Tracks admin status per user
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users, unique)
      - `is_admin` (boolean, default false)
      - `created_at` (timestamptz)
    - `categories` - Admin-managed expense categories
      - `id` (uuid, primary key)
      - `name` (text, unique, not null)
      - `created_at` (timestamptz)

  2. New Functions
    - `is_admin()` - Returns true if current user is admin
    - `claim_admin_role(admin_code text)` - Claim admin role with secret code
    - `admin_create_household(household_name text)` - Admin-only household creation
    - `admin_add_household_member(p_household_id uuid, p_user_email text, p_role text)` - Admin assigns users to households
    - `admin_remove_household_member(p_member_id uuid)` - Admin removes household members
    - `admin_list_users()` - Admin lists all registered users

  3. Security
    - RLS on user_roles: users can view own role, admins can manage all
    - RLS on categories: all authenticated can read, admins can write
    - Admin override policies on households, expenses, household_members, exports
    - Restrict household creation to admins only

  4. Seed Data
    - 9 default categories
*/

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Admin check function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true
  )
$$;

-- Claim admin role with secret code
CREATE OR REPLACE FUNCTION claim_admin_role(admin_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF admin_code != 'ledgerx-admin-2024' THEN
    RETURN false;
  END IF;

  INSERT INTO user_roles (user_id, is_admin)
  VALUES (auth.uid(), true)
  ON CONFLICT (user_id)
  DO UPDATE SET is_admin = true;

  RETURN true;
END;
$$;

-- Admin-only household creation (no auto-membership)
CREATE OR REPLACE FUNCTION admin_create_household(household_name text)
RETURNS TABLE (id uuid, name text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can create households';
  END IF;

  RETURN QUERY
  INSERT INTO households (name)
  VALUES (household_name)
  RETURNING households.id, households.name, households.created_at;
END;
$$;

-- Admin assigns user to household by email
CREATE OR REPLACE FUNCTION admin_add_household_member(p_household_id uuid, p_user_email text, p_role text DEFAULT 'member')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  new_member_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can manage household members';
  END IF;

  SELECT au.id INTO target_user_id FROM auth.users au WHERE au.email = p_user_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', p_user_email;
  END IF;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (p_household_id, target_user_id, p_role)
  ON CONFLICT DO NOTHING
  RETURNING household_members.id INTO new_member_id;

  RETURN new_member_id;
END;
$$;

-- Admin removes household member
CREATE OR REPLACE FUNCTION admin_remove_household_member(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can manage household members';
  END IF;

  DELETE FROM household_members WHERE id = p_member_id;
END;
$$;

-- Admin lists all registered users
CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (id uuid, email text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT au.id, au.email::text, au.created_at
  FROM auth.users au
  WHERE EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_admin = true)
  ORDER BY au.created_at DESC
$$;

-- Lock down old create_household_with_owner to admin-only
CREATE OR REPLACE FUNCTION create_household_with_owner(household_name text)
RETURNS TABLE (id uuid, name text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can create households';
  END IF;

  INSERT INTO households (name)
  VALUES (household_name)
  RETURNING households.id, households.name, households.created_at
  INTO id, name, created_at;

  new_household_id := id;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (new_household_id, auth.uid(), 'owner');

  RETURN NEXT;
END;
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view own role"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin can manage roles"
  ON user_roles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- RLS Policies for categories
CREATE POLICY "All authenticated users can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can create categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (is_admin());

-- Admin override policies for full visibility
DROP POLICY IF EXISTS "Users can create households" ON households;

CREATE POLICY "Admins can create households"
  ON households FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can view all households"
  ON households FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update all households"
  ON households FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete all households"
  ON households FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can view all household members"
  ON household_members FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can add household members"
  ON household_members FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can remove household members"
  ON household_members FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can view all expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can view all exports"
  ON exports FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can create exports"
  ON exports FOR INSERT
  TO authenticated
  WITH CHECK (is_admin() AND requested_by = auth.uid());

-- Seed default categories
INSERT INTO categories (name) VALUES
  ('Groceries'),
  ('Utilities'),
  ('Rent/Mortgage'),
  ('Transportation'),
  ('Dining'),
  ('Entertainment'),
  ('Healthcare'),
  ('Shopping'),
  ('Other')
ON CONFLICT (name) DO NOTHING;
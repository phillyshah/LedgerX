/*
  # Add User Profiles with Username Support
  
  ## Changes
  
  ### 1. New Tables
  - `user_profiles`
    - `id` (uuid, primary key, references auth.users)
    - `username` (text, unique, not null) - Short username for login
    - `email` (text, not null) - Stored for reference
    - `created_at` (timestamptz)
  
  ### 2. Security
  - Enable RLS on `user_profiles` table
  - Users can view all profiles (needed for username lookup during login)
  - Only the user can update their own profile
  - Profiles are automatically created via trigger on auth.users
  
  ### 3. Helper Function
  - `get_user_id_by_username` - Function to look up user_id by username for authentication
  
  ## Notes
  - Username must be 3-20 characters, alphanumeric and underscores only
  - Username is case-insensitive for lookups
  - Trigger automatically creates profile when user signs up
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "Users can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Function to get user email by username (for login)
CREATE OR REPLACE FUNCTION get_user_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email
  FROM user_profiles
  WHERE LOWER(username) = LOWER(p_username);
  
  RETURN user_email;
END;
$$;

-- Create trigger function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Extract username from email (before @) or use a generated one
  INSERT INTO public.user_profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      'user_' || substr(NEW.id::text, 1, 8)
    ),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- Backfill existing users (create profiles for existing users)
DO $$
DECLARE
  r RECORD;
  new_username text;
  counter int;
BEGIN
  FOR r IN SELECT id, email FROM auth.users LOOP
    -- Generate username from email (before @)
    new_username := split_part(r.email, '@', 1);
    new_username := regexp_replace(new_username, '[^a-zA-Z0-9_]', '', 'g');
    new_username := CASE 
      WHEN length(new_username) < 3 THEN 'user_' || substr(r.id::text, 1, 8)
      WHEN length(new_username) > 20 THEN substr(new_username, 1, 20)
      ELSE new_username
    END;
    
    -- Handle duplicate usernames
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM user_profiles WHERE username = new_username) LOOP
      new_username := split_part(r.email, '@', 1) || counter::text;
      new_username := regexp_replace(new_username, '[^a-zA-Z0-9_]', '', 'g');
      new_username := substr(new_username, 1, 20);
      counter := counter + 1;
    END LOOP;
    
    INSERT INTO user_profiles (id, username, email)
    VALUES (r.id, new_username, r.email)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

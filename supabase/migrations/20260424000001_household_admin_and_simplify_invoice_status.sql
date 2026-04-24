-- Add household_admin role + simplify contractor_invoices status to pending/paid
--
-- Household admin is a scaled-down admin:
--   * Can do everything a contractor can (submit receipts + invoices)
--   * Can view invoices and expenses across households they're a member of
--   * CANNOT manage users, households, categories
--   * CANNOT approve or mark invoices paid (full admin only)
--   * Can edit/delete only their own expenses; read-only on others
--
-- Invoice status simplified from (pending, approved, paid, rejected) to
-- (pending, paid). Data migration: approved -> paid, rejected -> pending.

-- 1. Role column + helper ---------------------------------------------------

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS is_household_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION is_household_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT is_household_admin FROM user_roles WHERE user_id = auth.uid()),
    false
  );
$$;

-- 2. admin_update_user_role now accepts is_household_admin -----------------

DROP FUNCTION IF EXISTS admin_update_user_role(uuid, boolean, boolean);

CREATE OR REPLACE FUNCTION admin_update_user_role(
  p_user_id uuid,
  p_is_admin boolean,
  p_is_contractor boolean DEFAULT NULL,
  p_is_household_admin boolean DEFAULT NULL
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

  INSERT INTO user_roles (user_id, is_admin, is_contractor, is_household_admin)
  VALUES (
    p_user_id,
    p_is_admin,
    COALESCE(p_is_contractor, false),
    COALESCE(p_is_household_admin, false)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_admin           = EXCLUDED.is_admin,
    is_contractor      = COALESCE(p_is_contractor, user_roles.is_contractor),
    is_household_admin = COALESCE(p_is_household_admin, user_roles.is_household_admin);
END;
$$;

-- 3. admin_list_users exposes is_household_admin ---------------------------

DROP FUNCTION IF EXISTS admin_list_users();

CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  id uuid,
  username text,
  created_at timestamptz,
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

-- 4. Invoice RLS: household_admin can view invoices for their households ---
--
-- Existing policies: contractors view their own; admins view all.
-- Add: household_admin views invoices whose household_id is in their memberships.

DROP POLICY IF EXISTS "Household admins view invoices in their households" ON contractor_invoices;
CREATE POLICY "Household admins view invoices in their households"
  ON contractor_invoices FOR SELECT
  USING (
    is_household_admin()
    AND household_id IS NOT NULL
    AND household_id IN (SELECT user_households())
  );

DROP POLICY IF EXISTS "Household admins view invoice images in their households" ON invoice_images;
CREATE POLICY "Household admins view invoice images in their households"
  ON invoice_images FOR SELECT
  USING (
    is_household_admin()
    AND EXISTS (
      SELECT 1 FROM contractor_invoices ci
      WHERE ci.id = invoice_images.invoice_id
        AND ci.household_id IS NOT NULL
        AND ci.household_id IN (SELECT user_households())
    )
  );

-- Household admins can submit invoices like contractors (inherit contractor ability)
DROP POLICY IF EXISTS "Household admins insert own invoices" ON contractor_invoices;
CREATE POLICY "Household admins insert own invoices"
  ON contractor_invoices FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND is_household_admin()
    AND (
      household_id IS NULL
      OR household_id IN (SELECT user_households())
    )
  );

DROP POLICY IF EXISTS "Household admins insert own invoice images" ON invoice_images;
CREATE POLICY "Household admins insert own invoice images"
  ON invoice_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contractor_invoices ci
      WHERE ci.id = invoice_images.invoice_id
        AND ci.created_by = auth.uid()
    )
  );

-- 5. Simplify contractor_invoices.status to (pending, paid) ----------------

-- a) Data migration: approved -> paid, rejected -> pending
UPDATE contractor_invoices SET status = 'paid',
  paid_at = COALESCE(paid_at, now()),
  updated_at = now()
  WHERE status = 'approved';

UPDATE contractor_invoices SET status = 'pending',
  updated_at = now()
  WHERE status = 'rejected';

-- b) Drop old CHECK constraint, add new one
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'contractor_invoices'
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%status%approved%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contractor_invoices DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE contractor_invoices
  ADD CONSTRAINT contractor_invoices_status_check
  CHECK (status IN ('pending', 'paid'));

-- 6. admin_update_invoice_status: only pending/paid, admin-only -----------

CREATE OR REPLACE FUNCTION admin_update_invoice_status(
  p_invoice_id  uuid,
  p_status      text,
  p_admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_status NOT IN ('pending', 'paid') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  UPDATE contractor_invoices
  SET
    status      = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    paid_at     = CASE WHEN p_status = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
    updated_at  = now()
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_invoice_status(uuid, text, text) TO authenticated;

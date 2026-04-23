-- ============================================================
-- Migration: Add contractor invoice system
-- Date: 2026-04-23
-- ============================================================

-- 1. Add property_type to households
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS property_type text
  CHECK (property_type IN ('Residential', 'Commercial', 'Vacation Rental', 'Other'));

-- 2. Create contractor_invoices table
CREATE TABLE IF NOT EXISTS contractor_invoices (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      text          NOT NULL,
  created_by          uuid          NOT NULL REFERENCES auth.users(id),
  household_id        uuid          REFERENCES households(id) ON DELETE SET NULL,
  amount              numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency            text          NOT NULL DEFAULT 'USD',
  description         text          NOT NULL,
  service_date_start  date          NOT NULL,
  service_date_end    date          NOT NULL,
  due_date            date,
  status              text          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  admin_notes         text,
  image_path          text,
  image_mime          text,
  image_width         integer,
  image_height        integer,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  paid_at             timestamptz,
  CHECK (service_date_end >= service_date_start)
);

-- 3. Create invoice_images table (mirrors expense_images)
CREATE TABLE IF NOT EXISTS invoice_images (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid        NOT NULL REFERENCES contractor_invoices(id) ON DELETE CASCADE,
  image_path     text        NOT NULL,
  image_mime     text,
  image_width    integer,
  image_height   integer,
  display_order  integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS contractor_invoices_created_by_idx
  ON contractor_invoices(created_by);

CREATE INDEX IF NOT EXISTS contractor_invoices_household_id_idx
  ON contractor_invoices(household_id);

CREATE INDEX IF NOT EXISTS contractor_invoices_status_idx
  ON contractor_invoices(status);

CREATE INDEX IF NOT EXISTS invoice_images_invoice_id_idx
  ON invoice_images(invoice_id);

-- 5. updated_at trigger for contractor_invoices
-- (reuse set_updated_at if it already exists, otherwise create it)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contractor_invoices_updated_at ON contractor_invoices;
CREATE TRIGGER contractor_invoices_updated_at
  BEFORE UPDATE ON contractor_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. RLS — contractor_invoices
ALTER TABLE contractor_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractors insert own invoices" ON contractor_invoices;
CREATE POLICY "Contractors insert own invoices"
  ON contractor_invoices FOR INSERT
  WITH CHECK (auth.uid() = created_by AND is_contractor());

DROP POLICY IF EXISTS "Contractors view own invoices" ON contractor_invoices;
CREATE POLICY "Contractors view own invoices"
  ON contractor_invoices FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Admins view all invoices" ON contractor_invoices;
CREATE POLICY "Admins view all invoices"
  ON contractor_invoices FOR SELECT
  USING (is_admin());

-- 7. RLS — invoice_images
ALTER TABLE invoice_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractors insert own invoice images" ON invoice_images;
CREATE POLICY "Contractors insert own invoice images"
  ON invoice_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contractor_invoices ci
      WHERE ci.id = invoice_images.invoice_id
        AND ci.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Contractors view own invoice images" ON invoice_images;
CREATE POLICY "Contractors view own invoice images"
  ON invoice_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contractor_invoices ci
      WHERE ci.id = invoice_images.invoice_id
        AND ci.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins view all invoice images" ON invoice_images;
CREATE POLICY "Admins view all invoice images"
  ON invoice_images FOR SELECT
  USING (is_admin());

-- 8. Admin RPC: update invoice status (SECURITY DEFINER — bypasses RLS)
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

  IF p_status NOT IN ('pending', 'approved', 'paid', 'rejected') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  UPDATE contractor_invoices
  SET
    status      = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    paid_at     = CASE WHEN p_status = 'paid' THEN now() ELSE paid_at END,
    updated_at  = now()
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_invoice_status(uuid, text, text) TO authenticated;

-- 9. Admin RPC: set property type on a household (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION admin_set_property_type(
  p_household_id  uuid,
  p_type          text
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

  IF p_type IS NOT NULL AND p_type NOT IN ('Residential', 'Commercial', 'Vacation Rental', 'Other') THEN
    RAISE EXCEPTION 'invalid property type: %', p_type;
  END IF;

  UPDATE households
  SET property_type = p_type
  WHERE id = p_household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_property_type(uuid, text) TO authenticated;

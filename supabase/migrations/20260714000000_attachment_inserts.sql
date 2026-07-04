-- ============================================================
-- Migration: Attach photos to existing invoices & estimates (v11.9)
-- ============================================================
--
-- Until now only a record's CREATOR could insert child image/attachment rows
-- (the INSERT policies keyed WITH CHECK to parent.created_by = auth.uid()).
-- We now let anyone who can VIEW the record add photos to it: the creator,
-- full admins, and household members (plus invited participants for estimates)
-- — mirroring the existing SELECT visibility. Storage uploads were already
-- household-membership-scoped, so this row-level INSERT policy is the only gate
-- that had to change.
--
-- The legacy single-slot columns (contractor_invoices.image_path,
-- estimates.file_path) are intentionally NOT opened up — non-owner adds target
-- the child tables only, and the detail views already merge [legacy, ...children].

-- ─── 1. invoice_images: view-access INSERT ──────────────────────────────────
DROP POLICY IF EXISTS "Contractors insert own invoice images" ON invoice_images;
DROP POLICY IF EXISTS "Household admins insert own invoice images" ON invoice_images;

DROP POLICY IF EXISTS "Viewers insert invoice images" ON invoice_images;
CREATE POLICY "Viewers insert invoice images"
  ON invoice_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contractor_invoices ci
      WHERE ci.id = invoice_images.invoice_id
        AND (
          is_admin()
          OR ci.created_by = auth.uid()
          -- Mirror invoice SELECT visibility: plain household members can't view
          -- invoices, only household ADMINS can — so scope the add to them.
          OR (is_household_admin() AND ci.household_id IS NOT NULL AND ci.household_id IN (SELECT user_households()))
        )
    )
  );

-- ─── 2. estimate_attachments: view-access INSERT ────────────────────────────
DROP POLICY IF EXISTS "Contractors insert own estimate attachments" ON estimate_attachments;
DROP POLICY IF EXISTS "Members insert own estimate attachments" ON estimate_attachments;

DROP POLICY IF EXISTS "Viewers insert estimate attachments" ON estimate_attachments;
CREATE POLICY "Viewers insert estimate attachments"
  ON estimate_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_attachments.estimate_id
        AND (
          is_admin()
          OR e.created_by = auth.uid()
          OR (e.household_id IS NOT NULL AND e.household_id IN (SELECT user_households()))
          OR EXISTS (
            SELECT 1 FROM estimate_participants ep
            WHERE ep.estimate_id = e.id AND ep.user_id = auth.uid()
          )
        )
    )
  );

-- Allow deletion of contractor_invoices by:
--   1. The creator (owner deletes their own submission)
--   2. Full admins (superadmin can clean up any invoice)
--
-- invoice_images cascades on contractor_invoices delete (FK ON DELETE CASCADE)
-- so images are cleaned up automatically. Storage objects in the `receipts`
-- bucket are NOT cleaned up here (mirrors expense delete behavior — orphan
-- cleanup is handled out of band).

DROP POLICY IF EXISTS "Creators delete own invoices" ON contractor_invoices;
CREATE POLICY "Creators delete own invoices"
  ON contractor_invoices
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Admins delete any invoice" ON contractor_invoices;
CREATE POLICY "Admins delete any invoice"
  ON contractor_invoices
  FOR DELETE
  TO authenticated
  USING (is_admin());

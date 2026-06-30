-- Allow any authenticated user to submit estimates (not just contractors/admins).
-- Review and status changes remain admin-only. These policies OR with existing ones.

DROP POLICY IF EXISTS "Members insert own estimates" ON estimates;
CREATE POLICY "Members insert own estimates"
  ON estimates FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Members insert own estimate attachments" ON estimate_attachments;
CREATE POLICY "Members insert own estimate attachments"
  ON estimate_attachments FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM estimates WHERE id = estimate_id AND created_by = auth.uid())
  );

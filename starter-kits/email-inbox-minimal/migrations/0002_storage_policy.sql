-- Storage RLS for forwarded attachments.
--
-- Files land at:
--   attachments/email-inbox/{user_id}/{uuid}.{ext}
--
-- The edge function uses service_role (which bypasses RLS), but users
-- need explicit policies to read back their own files via signed URLs.
--
-- TODO: replace 'attachments' with your bucket name if different.

CREATE POLICY "Users can view own email-inbox attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = 'email-inbox'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Service can write email-inbox attachments"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = 'email-inbox'
  );

-- No DELETE policy on purpose — attachments outlive the inbox row so the
-- references stay valid for whatever record you create from them.

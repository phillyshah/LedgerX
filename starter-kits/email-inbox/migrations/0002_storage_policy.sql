-- Storage RLS for forwarded attachments.
--
-- The edge function uploads to:
--   attachments/email-inbox/{user_id}/{uuid}.{ext}
--
-- Default storage policies typically tie SELECT to some app-specific scope
-- (household, team, etc.) that doesn't apply here — so users can't read
-- their own forwarded files unless we add narrow policies for the
-- email-inbox/ prefix.
--
-- TODO: replace 'attachments' with your bucket name in three places below.

-- Owners can read their own email-inbox attachments.
CREATE POLICY "Users can view own email-inbox attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = 'email-inbox'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Service role (edge function) can write into the email-inbox prefix.
CREATE POLICY "Service can write email-inbox attachments"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = 'email-inbox'
  );

-- Optional: admins can read any user's email-inbox attachments for support.
-- TODO: replace the EXISTS check with whatever your app calls an admin.
--
-- CREATE POLICY "Admins can view any email-inbox attachments"
--   ON storage.objects FOR SELECT
--   TO authenticated
--   USING (
--     bucket_id = 'attachments'
--     AND (storage.foldername(name))[1] = 'email-inbox'
--     AND EXISTS (
--       SELECT 1 FROM public.user_roles
--       WHERE user_id = auth.uid() AND is_admin = true
--     )
--   );

-- No DELETE policy on purpose — attachments outlive the inbox row so they
-- remain attached to whatever record the user creates from the card.

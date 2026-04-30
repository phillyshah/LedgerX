/*
  # Allow users to read their own email-inbox attachments

  ## Why
  The inbound-email function uploads forwarded attachments to
  `receipts/email-inbox/{user_id}/{uuid}.{ext}`. The pre-existing
  "Users can view receipts" policy only matches when the FIRST folder
  segment is a household_id the user belongs to (or the user is an
  admin) — so regular users can't read their own forwarded files,
  which means:
    • thumbnails in EmailInboxPanel never appear, and
    • AddExpense/InvoiceForm can't pre-populate the receipt image
      when opened from the inbox.

  This migration adds two narrow policies that grant SELECT and INSERT
  on `receipts` storage paths shaped `email-inbox/{auth.uid()}/...`.
  Other prefixes are unchanged.

  No DELETE policy: forwarded attachments stick around even after
  the user discards or accepts the inbox row, so they remain
  attached to the resulting expense/invoice (which copies them to
  the household path on save).
*/

CREATE POLICY "Users can view own email-inbox attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = 'email-inbox'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Service can write email-inbox attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = 'email-inbox'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

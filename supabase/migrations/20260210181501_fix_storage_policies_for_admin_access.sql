/*
  # Fix Storage Policies for Admin Access

  ## Changes
  
  ### 1. Update Storage Policies for Receipts Bucket
  - Allow admins to view all receipts
  - Allow admins to upload receipts to any household folder
  - Allow admins to delete any receipt
  - Allow admins to update any receipt
  
  ## Notes
  - This ensures admins can fully edit transactions including viewing/adding/deleting receipt images
  - Regular users still restricted to their household receipts only
*/

-- Drop existing storage policies
DROP POLICY IF EXISTS "Household members can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Household members can delete receipts" ON storage.objects;

-- Allow viewing receipts for household members or admins
CREATE POLICY "Users can view receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT household_id::text
        FROM household_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Allow uploading receipts for household members or admins
CREATE POLICY "Users can upload receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT household_id::text
        FROM household_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Allow deleting receipts for household members or admins
CREATE POLICY "Users can delete receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT household_id::text
        FROM household_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Allow updating receipts for household members or admins
CREATE POLICY "Users can update receipts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT household_id::text
        FROM household_members
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT household_id::text
        FROM household_members
        WHERE user_id = auth.uid()
      )
    )
  );

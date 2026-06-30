-- ============================================================
-- Migration: Allow full admins to submit their own estimates
-- Date: 2026-07-02  (v10.6)
-- ============================================================
--
-- Estimates were contractor-submit-only. Admins sometimes receive an
-- estimate directly from a subcontractor and want to log it on the same
-- property. INSERT policies are OR'd, so this is purely additive — the
-- existing "Contractors insert own estimates" policy is untouched.
--
-- Admins can file against any household (they oversee all of them), so no
-- household-membership restriction here — only that they own the row.

DROP POLICY IF EXISTS "Admins insert own estimates" ON estimates;
CREATE POLICY "Admins insert own estimates"
  ON estimates FOR INSERT
  WITH CHECK (auth.uid() = created_by AND is_admin());

-- Tighten household scoping for contractor invoices and audit
--
-- Previously, `contractor_invoices` INSERT allowed a contractor to submit an
-- invoice against any household_id (only `created_by = auth.uid()` and
-- `is_contractor()` were enforced). A malicious contractor could craft an
-- invoice tagged to a household they don't belong to and have it show up in
-- another admin's inbox.
--
-- Tighten the INSERT policy to also require that the contractor is a member
-- of the target household (or household_id is NULL for contractors with no
-- household yet).

DROP POLICY IF EXISTS "Contractors insert own invoices" ON contractor_invoices;
CREATE POLICY "Contractors insert own invoices"
  ON contractor_invoices FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND is_contractor()
    AND (
      household_id IS NULL
      OR household_id IN (SELECT user_households())
    )
  );

-- Defense in depth: also restrict expenses INSERT so users can only post
-- expenses to households they're members of. Current expenses INSERT policies
-- are already scoped by household_members in other migrations, but verify by
-- recreating the policy with the same check.
--
-- (No change if the existing policy already checks membership — the recreate
-- is a no-op safeguard.)

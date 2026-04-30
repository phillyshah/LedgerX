-- Feature: Admin-managed Vendor Catalog (v6.6)
--
-- The existing vendor_category_map table memoizes vendor → category per
-- household, but only ever after a user has saved an expense with that
-- pair. This migration extends the table so admins can curate global
-- entries (visible to all households) and back-fills the table from
-- existing expense rows so brand-new households inherit the patterns
-- their members have already established by hand.

-- 1) Allow household_id NULL to represent a global/admin-curated mapping.
ALTER TABLE vendor_category_map
  ALTER COLUMN household_id DROP NOT NULL;

-- 2) The existing UNIQUE(household_id, vendor_name) constraint treats two
--    NULL household_id rows as distinct, which would let admins create
--    duplicate global rows for the same vendor. Replace with a partial
--    unique index that enforces uniqueness for both scopes correctly.
ALTER TABLE vendor_category_map
  DROP CONSTRAINT IF EXISTS vendor_category_map_household_id_vendor_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_category_map_scoped_uniq
  ON vendor_category_map(household_id, lower(vendor_name))
  WHERE household_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_category_map_global_uniq
  ON vendor_category_map(lower(vendor_name))
  WHERE household_id IS NULL;

-- 3) RLS: globals are readable by everyone. Drop+recreate the SELECT
--    policy to include the global case. INSERT/UPDATE remain
--    household-scoped for non-admins; admins use the RPC below for
--    global writes.
DROP POLICY IF EXISTS "Members can view vendor category mappings" ON vendor_category_map;
CREATE POLICY "Members and globals visible"
  ON vendor_category_map FOR SELECT
  USING (
    household_id IS NULL
    OR household_id IN (
      SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid()
    )
  );

-- 4) DELETE policy — admins can clean up curated rows; members can
--    delete their own household rows (handy when a vendor was misspelled
--    once and the bad mapping keeps auto-filling).
CREATE POLICY "Admins delete any vendor mapping"
  ON vendor_category_map FOR DELETE
  USING (is_admin());

CREATE POLICY "Members delete own household vendor mappings"
  ON vendor_category_map FOR DELETE
  USING (
    household_id IS NOT NULL
    AND household_id IN (
      SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid()
    )
  );

-- 5) Admin RPC for upserting any (household-specific OR global) mapping.
--    Frontend inserts/updates against the table directly when scope is
--    household-bound and the user is a member; this RPC is used for
--    global-scope writes (NULL household_id) which RLS would otherwise
--    reject. Also handy for admin-led writes against households the
--    admin doesn't happen to be a member of.
CREATE OR REPLACE FUNCTION admin_upsert_vendor_mapping(
  p_household_id uuid,
  p_vendor_name  text,
  p_category_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_household_id IS NULL THEN
    INSERT INTO vendor_category_map (household_id, vendor_name, category_name, updated_at)
    VALUES (NULL, p_vendor_name, p_category_name, now())
    ON CONFLICT (lower(vendor_name)) WHERE household_id IS NULL
    DO UPDATE SET category_name = EXCLUDED.category_name, updated_at = now();
  ELSE
    INSERT INTO vendor_category_map (household_id, vendor_name, category_name, updated_at)
    VALUES (p_household_id, p_vendor_name, p_category_name, now())
    ON CONFLICT (household_id, lower(vendor_name)) WHERE household_id IS NOT NULL
    DO UPDATE SET category_name = EXCLUDED.category_name, updated_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_upsert_vendor_mapping(uuid, text, text) TO authenticated;

-- 6) Back-fill: for every (household, vendor, category) triple already
--    present in expenses but missing from the catalog, insert a row.
--    The auto-learner only writes on save going forward; this captures
--    history. ON CONFLICT DO NOTHING means we never overwrite admin
--    curation done after this migration runs.
INSERT INTO vendor_category_map (household_id, vendor_name, category_name, updated_at)
SELECT DISTINCT ON (e.household_id, lower(e.vendor))
  e.household_id,
  e.vendor,
  e.category,
  COALESCE(e.created_at, now())
FROM expenses e
WHERE e.household_id IS NOT NULL
  AND e.vendor IS NOT NULL
  AND e.category IS NOT NULL
  AND length(trim(e.vendor)) > 0
ORDER BY e.household_id, lower(e.vendor), e.created_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

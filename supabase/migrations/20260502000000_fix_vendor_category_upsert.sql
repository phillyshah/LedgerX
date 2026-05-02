-- Fix vendor_category_map upsert from the frontend.
--
-- v6.6 (migration 20260429000000_vendor_catalog.sql) dropped the old
-- UNIQUE(household_id, vendor_name) constraint in favor of two partial
-- unique indexes on `lower(vendor_name)`:
--
--   vendor_category_map_scoped_uniq  ON (household_id, lower(vendor_name)) WHERE household_id IS NOT NULL
--   vendor_category_map_global_uniq  ON (lower(vendor_name))               WHERE household_id IS NULL
--
-- The case-insensitive matching is correct, but it broke the frontend's
-- PostgREST upsert: AddExpense calls
--
--   .upsert({...}, { onConflict: 'household_id,vendor_name' })
--
-- PostgREST tries to match those literal columns against an existing
-- index/constraint and can't find one (the indexes are on the
-- *expression* lower(vendor_name), not on vendor_name), so it returns
-- HTTP 400. Vendor→category memorization has been silently broken since
-- v6.6 for every new save.
--
-- Fix: SECURITY DEFINER RPC that performs the upsert in SQL using
-- ON CONFLICT against the partial index's column list. The RPC enforces
-- household membership so it can't be abused by a non-member to write
-- mappings into another household. Global mappings remain admin-only
-- via the existing admin RPC in 20260429000000_vendor_catalog.sql.

CREATE OR REPLACE FUNCTION upsert_vendor_category(
  p_household_id uuid,
  p_vendor_name  text,
  p_category_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'household_id is required';
  END IF;

  IF p_household_id NOT IN (SELECT user_households()) AND NOT is_admin() THEN
    RAISE EXCEPTION 'not a member of this household';
  END IF;

  INSERT INTO vendor_category_map (household_id, vendor_name, category_name, updated_at)
  VALUES (p_household_id, p_vendor_name, p_category_name, now())
  ON CONFLICT (household_id, lower(vendor_name)) WHERE household_id IS NOT NULL
  DO UPDATE SET
    category_name = EXCLUDED.category_name,
    updated_at    = EXCLUDED.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_vendor_category(uuid, text, text) TO authenticated;

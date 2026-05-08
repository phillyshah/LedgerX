-- Fix category picker for non-admin users.
--
-- RLS on category_households restricts SELECT to rows belonging to the
-- caller's own households. This means a regular user can't tell whether
-- a category is "truly global" (no entries in category_households) or
-- "scoped to a different household" (entries exist, just not visible).
-- Both look the same client-side, so scoped categories leaked into
-- every household's picker.
--
-- Solution: SECURITY DEFINER function that bypasses RLS and applies
-- the correct logic server-side.
--
-- Security: callers must be authenticated; household-mapped categories
-- are only returned when the caller is a member of (or admin for) the
-- requested household. Truly global categories (zero entries in
-- category_households) are visible to any authenticated caller.

CREATE OR REPLACE FUNCTION get_household_categories(p_household_id uuid)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Categories explicitly mapped to this household.
  -- Only returned when the caller is a member or admin.
  SELECT c.id, c.name
  FROM categories c
  JOIN category_households ch ON ch.category_id = c.id
  WHERE ch.household_id = p_household_id
    AND auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = p_household_id
          AND hm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.is_admin = true
      )
    )

  UNION

  -- Truly global categories: no entries in category_households at all.
  -- Available to any authenticated caller.
  -- UNION (not UNION ALL) is safe: the two sets are mutually exclusive —
  -- a category either has entries in category_households or it doesn't.
  SELECT c.id, c.name
  FROM categories c
  WHERE auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM category_households ch2 WHERE ch2.category_id = c.id
    )

  ORDER BY name;
$$;

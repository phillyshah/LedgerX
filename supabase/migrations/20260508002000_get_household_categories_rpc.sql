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

CREATE OR REPLACE FUNCTION get_household_categories(p_household_id uuid)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Categories explicitly mapped to this household
  SELECT c.id, c.name
  FROM categories c
  JOIN category_households ch ON ch.category_id = c.id
  WHERE ch.household_id = p_household_id

  UNION

  -- Truly global: no entries in category_households at all
  SELECT c.id, c.name
  FROM categories c
  WHERE NOT EXISTS (
    SELECT 1 FROM category_households ch2 WHERE ch2.category_id = c.id
  )

  ORDER BY name;
$$;

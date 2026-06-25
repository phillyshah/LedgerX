-- Fix admin_set_household_categories: MIN(uuid) is not supported in Postgres.
-- Cast household_id to text before aggregating, then cast back to uuid.

CREATE OR REPLACE FUNCTION admin_set_household_categories(
  p_household_id uuid,
  p_category_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected uuid[];
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM households WHERE id = p_household_id) THEN
    RAISE EXCEPTION 'household not found';
  END IF;

  -- Collect every category touched on either side of the diff so we can
  -- recompute the legacy categories.household_id below.
  SELECT ARRAY(
    SELECT DISTINCT cat_id
    FROM (
      SELECT category_id AS cat_id
      FROM category_households
      WHERE household_id = p_household_id
      UNION
      SELECT unnest(COALESCE(p_category_ids, ARRAY[]::uuid[])) AS cat_id
    ) s
  ) INTO v_affected;

  -- Wipe this household's existing category links then re-insert the
  -- requested set. Other households' mappings are untouched.
  DELETE FROM category_households WHERE household_id = p_household_id;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) IS NOT NULL THEN
    INSERT INTO category_households (category_id, household_id)
    SELECT DISTINCT unnest(p_category_ids), p_household_id
    ON CONFLICT (category_id, household_id) DO NOTHING;
  END IF;

  -- Maintain the legacy categories.household_id column: set it when the
  -- category now belongs to exactly one household, NULL it otherwise.
  -- Cast to text for aggregation (Postgres has no MIN/MAX for uuid).
  IF v_affected IS NOT NULL AND array_length(v_affected, 1) IS NOT NULL THEN
    UPDATE categories c
    SET household_id = NULL
    WHERE c.id = ANY (v_affected);

    UPDATE categories c
    SET household_id = sub.h_id
    FROM (
      SELECT
        category_id,
        MIN(household_id::text)::uuid AS h_id,
        COUNT(*) AS cnt
      FROM category_households
      WHERE category_id = ANY (v_affected)
      GROUP BY category_id
    ) sub
    WHERE c.id = sub.category_id AND sub.cnt = 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_household_categories(uuid, uuid[]) TO authenticated;

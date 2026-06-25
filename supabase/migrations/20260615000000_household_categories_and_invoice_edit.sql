-- Quality-of-life RPCs for v10.4.
--
-- 1. admin_set_household_categories
--    Inverse of admin_set_category_households. Lets an admin set ALL the
--    categories for one household in a single call — useful when a new
--    household is created and ten categories need to be wired up at once.
--    Recomputes the legacy categories.household_id field for every affected
--    category to keep it consistent (set to the single household when a
--    category is assigned to exactly one, NULL otherwise).
--
-- 2. admin_update_invoice_details
--    Single-call edit for household_id, category_id, and admin_notes on a
--    contractor invoice. Pre-existing admin_set_invoice_category handled
--    only the category; this rolls all three editable fields into one
--    server-side update so the invoice-review modal can save them atomically.

-- ─── 1. admin_set_household_categories ───────────────────────────────────────
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

  -- Track every category that is being touched on either side of the diff so
  -- we can recompute their legacy household_id below.
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

  -- Wipe this household's existing category links, then re-insert the
  -- requested set. Other households' mappings are untouched.
  DELETE FROM category_households WHERE household_id = p_household_id;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) IS NOT NULL THEN
    INSERT INTO category_households (category_id, household_id)
    SELECT DISTINCT unnest(p_category_ids), p_household_id
    ON CONFLICT (category_id, household_id) DO NOTHING;
  END IF;

  -- Maintain the legacy categories.household_id column the same way
  -- admin_set_category_households does: set it when the category lives in
  -- exactly one household, NULL it otherwise.
  IF v_affected IS NOT NULL AND array_length(v_affected, 1) IS NOT NULL THEN
    UPDATE categories c
    SET household_id = NULL
    WHERE c.id = ANY (v_affected);

    UPDATE categories c
    SET household_id = sub.h_id
    FROM (
      SELECT category_id, MIN(household_id)::uuid AS h_id, COUNT(*) AS cnt
      FROM category_households
      WHERE category_id = ANY (v_affected)
      GROUP BY category_id
    ) sub
    WHERE c.id = sub.category_id AND sub.cnt = 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_household_categories(uuid, uuid[]) TO authenticated;


-- ─── 2. admin_update_invoice_details ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_update_invoice_details(
  p_invoice_id   uuid,
  p_household_id uuid,
  p_category_id  uuid,
  p_admin_notes  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM contractor_invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  IF p_household_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM households WHERE id = p_household_id) THEN
    RAISE EXCEPTION 'household not found';
  END IF;

  IF p_category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'category not found';
  END IF;

  UPDATE contractor_invoices
  SET
    household_id = p_household_id,
    category_id  = p_category_id,
    admin_notes  = p_admin_notes,
    updated_at   = now()
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_invoice_details(uuid, uuid, uuid, text) TO authenticated;

/*
  # Add Transcript Field to Uncategorized Expenses Function
  
  ## Changes
  
  ### 1. Update admin_get_uncategorized_expenses Function
  - Add transcript field to the return table definition
  - Include transcript in the SELECT statement
  
  ## Notes
  - This allows admins to view and edit the transcript field when managing uncategorized transactions
*/

-- Drop and recreate function with transcript field
DROP FUNCTION IF EXISTS admin_get_uncategorized_expenses();

CREATE OR REPLACE FUNCTION admin_get_uncategorized_expenses()
RETURNS TABLE (
  id uuid,
  household_id uuid,
  household_name text,
  created_by uuid,
  creator_email text,
  expense_date date,
  vendor text,
  total numeric,
  currency text,
  category text,
  notes text,
  transcript text,
  image_path text,
  image_mime text,
  image_width integer,
  image_height integer,
  created_at timestamptz,
  updated_at timestamptz,
  is_orphaned_household boolean,
  is_invalid_category boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can view uncategorized expenses';
  END IF;

  RETURN QUERY
  SELECT 
    e.id,
    e.household_id,
    h.name as household_name,
    e.created_by,
    COALESCE(up.username, 'Unknown')::text as creator_email,
    e.expense_date::date,
    e.vendor,
    e.total,
    e.currency,
    e.category,
    e.notes,
    e.transcript,
    e.image_path,
    e.image_mime,
    e.image_width,
    e.image_height,
    e.created_at,
    e.updated_at,
    (e.household_id IS NULL) as is_orphaned_household,
    (
      e.category IS NOT NULL 
      AND NOT EXISTS (
        SELECT 1 FROM categories c 
        WHERE c.name = e.category 
        AND (c.household_id IS NULL OR c.household_id = e.household_id)
      )
    ) as is_invalid_category
  FROM expenses e
  LEFT JOIN households h ON h.id = e.household_id
  LEFT JOIN user_profiles up ON up.id = e.created_by
  WHERE 
    e.household_id IS NULL
    OR (
      e.category IS NOT NULL 
      AND NOT EXISTS (
        SELECT 1 FROM categories c 
        WHERE c.name = e.category 
        AND (c.household_id IS NULL OR c.household_id = e.household_id)
      )
    )
  ORDER BY e.expense_date DESC, e.created_at DESC;
END;
$$;

-- Vendor-to-category mapping table
-- Stores the last-used category for each vendor within a household.
-- When a receipt is scanned with a known vendor, the category auto-populates
-- (only if that category is still valid for the household).
CREATE TABLE IF NOT EXISTS vendor_category_map (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  vendor_name text NOT NULL,
  category_name text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(household_id, vendor_name)
);

-- Index for fast lookup by household + vendor
CREATE INDEX IF NOT EXISTS idx_vendor_category_map_lookup
  ON vendor_category_map(household_id, lower(vendor_name));

-- RLS policies
ALTER TABLE vendor_category_map ENABLE ROW LEVEL SECURITY;

-- Members of a household can read vendor mappings for that household
CREATE POLICY "Members can view vendor category mappings"
  ON vendor_category_map FOR SELECT
  USING (
    household_id IN (
      SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid()
    )
  );

-- Members of a household can insert/update vendor mappings
CREATE POLICY "Members can upsert vendor category mappings"
  ON vendor_category_map FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update vendor category mappings"
  ON vendor_category_map FOR UPDATE
  USING (
    household_id IN (
      SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid()
    )
  );

/*
  # Add per-household feature flags

  Adds a `features_enabled` jsonb column to the `households` table so admins can
  toggle optional features on specific households (e.g. surgeon NPI lookup for
  medical-device accounts like "Maxx").

  Also adds `admin_update_household_features()` RPC so the frontend never
  UPDATEs the households table directly — only admins can flip flags.

  Feature key convention:
    features_enabled.surgeon_npi_lookup = true  → show NPI lookup button
*/

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS features_enabled jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION admin_update_household_features(
  p_household_id uuid,
  p_features jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE households
     SET features_enabled = COALESCE(p_features, '{}'::jsonb)
   WHERE id = p_household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_household_features(uuid, jsonb) TO authenticated;

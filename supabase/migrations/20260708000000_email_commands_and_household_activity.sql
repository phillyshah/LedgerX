-- ============================================================
-- Migration: Email commands + household activity notifications (v11.2)
-- ============================================================
--
-- Two service-role helpers, both called only from edge functions:
--
-- 1. email_command_report(p_user_id) — a compact JSON summary of estimates
--    and invoices scoped to the requesting user's role, for the email-command
--    bot (subject "estimates" / "invoices"). Full admins see everything;
--    household admins see their own households; anyone else gets no report.
--
-- 2. household_activity_recipients(kind, entity_id, actor) — who should get a
--    light "there's new activity" note when an invoice or estimate changes.
--    Every household member with an email on file, EXCEPT: the person who
--    triggered the event, and contractors who didn't initiate the item.

-- ─── 1. email_command_report ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION email_command_report(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_admin  boolean;
  v_ha     boolean;
  v_hh     uuid[];
  v_result jsonb;
BEGIN
  SELECT COALESCE(ur.is_admin, false), COALESCE(ur.is_household_admin, false)
    INTO v_admin, v_ha
  FROM user_roles ur
  WHERE ur.user_id = p_user_id;

  v_admin := COALESCE(v_admin, false);
  v_ha := COALESCE(v_ha, false);

  IF NOT (v_admin OR v_ha) THEN
    RETURN jsonb_build_object('role', 'member');
  END IF;

  IF v_ha AND NOT v_admin THEN
    SELECT COALESCE(array_agg(hm.household_id), '{}')
      INTO v_hh
    FROM household_members hm
    WHERE hm.user_id = p_user_id;
  END IF;

  WITH est AS (
    SELECT e.status, e.created_at
    FROM estimates e
    WHERE v_admin OR (e.household_id = ANY (v_hh))
  ),
  inv AS (
    SELECT i.status, i.amount
    FROM contractor_invoices i
    WHERE v_admin OR (i.household_id = ANY (v_hh))
  )
  SELECT jsonb_build_object(
    'role', CASE WHEN v_admin THEN 'admin' ELSE 'household_admin' END,
    'estimates', jsonb_build_object(
      'total',         (SELECT count(*) FROM est),
      'open',          (SELECT count(*) FROM est WHERE status = 'open'),
      'accepted',      (SELECT count(*) FROM est WHERE status = 'accepted'),
      'rejected',      (SELECT count(*) FROM est WHERE status = 'rejected'),
      'aging_over_14', (SELECT count(*) FROM est WHERE status = 'open'
                          AND created_at < now() - interval '14 days')
    ),
    'invoices', jsonb_build_object(
      'pending',       (SELECT count(*) FROM inv WHERE status = 'pending'),
      'paid',          (SELECT count(*) FROM inv WHERE status = 'paid'),
      'pending_total', COALESCE((SELECT sum(amount) FROM inv WHERE status = 'pending'), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION email_command_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_command_report(uuid) TO service_role;

-- ─── 2. household_activity_recipients ────────────────────────────────────────
CREATE OR REPLACE FUNCTION household_activity_recipients(
  p_kind      text,
  p_entity_id uuid,
  p_actor     uuid
)
RETURNS TABLE (email text, preferred_language text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_household uuid;
  v_creator   uuid;
BEGIN
  IF p_kind = 'estimate' THEN
    SELECT e.household_id, e.created_by INTO v_household, v_creator
    FROM estimates e WHERE e.id = p_entity_id;
  ELSIF p_kind = 'invoice' THEN
    SELECT i.household_id, i.created_by INTO v_household, v_creator
    FROM contractor_invoices i WHERE i.id = p_entity_id;
  ELSE
    RETURN;
  END IF;

  IF v_household IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT up.real_email, COALESCE(up.preferred_language, 'en')
  FROM household_members hm
  JOIN user_profiles up ON up.id = hm.user_id
  LEFT JOIN user_roles ur ON ur.user_id = hm.user_id
  WHERE hm.household_id = v_household
    AND up.real_email IS NOT NULL
    AND hm.user_id <> p_actor
    AND (COALESCE(ur.is_contractor, false) = false OR hm.user_id = v_creator);
END;
$$;

REVOKE ALL ON FUNCTION household_activity_recipients(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION household_activity_recipients(text, uuid, uuid) TO service_role;

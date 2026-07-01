-- ============================================================
-- Migration: Estimate reporting (v11.1)
-- ============================================================
--
-- 1) Extends list_team_activity to also surface estimate events
--    (submitted / accepted / rejected) in the team activity feed.
-- 2) Adds list_estimate_report — per-estimate rows (scoped by the same
--    admin / household-admin rules) that the frontend aggregates into a
--    pipeline / acceptance / aging report.
--
-- Estimates carry no monetary amount, so estimate activity rows report a
-- NULL amount. Status changes go through admin_set_estimate_status which
-- stamps updated_at, so updated_at is used as the decision timestamp for
-- accepted/rejected estimates (decided_at).

-- ─── 1. list_team_activity — add estimate events ─────────────────────────────
CREATE OR REPLACE FUNCTION list_team_activity(
  p_start        timestamptz,
  p_end          timestamptz,
  p_household_id uuid    DEFAULT NULL,
  p_actor_ids    uuid[]  DEFAULT NULL,
  p_event_types  text[]  DEFAULT NULL
)
RETURNS TABLE (
  event_id        text,
  event_type      text,
  entity_type     text,
  entity_id       uuid,
  actor_id        uuid,
  actor_username  text,
  household_id    uuid,
  household_name  text,
  category_id     uuid,
  amount          numeric,
  occurred_at     timestamptz,
  metadata        jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (is_admin() OR is_household_admin()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH allowed_actors AS (
    SELECT au.id AS user_id
    FROM auth.users au
    LEFT JOIN user_roles ur ON ur.user_id = au.id
    WHERE
      CASE
        WHEN is_admin() THEN true
        WHEN is_household_admin() THEN
          au.id <> auth.uid()
          AND COALESCE(ur.is_admin, false) = false
          AND COALESCE(ur.is_household_admin, false) = false
          AND EXISTS (
            SELECT 1 FROM household_members hm
            WHERE hm.user_id = au.id
              AND hm.household_id IN (SELECT user_households())
          )
        ELSE false
      END
  ),
  events AS (
    -- 1) Receipt submitted
    SELECT
      'expense_created'::text       AS event_type,
      'expense'::text               AS entity_type,
      e.id                          AS entity_id,
      e.created_by                  AS actor_id,
      e.household_id                AS household_id,
      NULL::uuid                    AS category_id,
      e.total                       AS amount,
      e.created_at                  AS occurred_at,
      jsonb_build_object(
        'vendor', e.vendor,
        'category', e.category,
        'expense_date', e.expense_date,
        'currency', e.currency
      )                              AS metadata
    FROM expenses e
    WHERE e.created_by IN (SELECT user_id FROM allowed_actors)

    UNION ALL

    -- 2) Expense marked paid (actor unknown — schema has no paid_by)
    SELECT
      'expense_paid'::text,
      'expense'::text,
      e.id,
      NULL::uuid,
      e.household_id,
      NULL::uuid,
      e.total,
      e.paid_at,
      jsonb_build_object(
        'vendor', e.vendor,
        'category', e.category,
        'expense_date', e.expense_date,
        'currency', e.currency,
        'submitter_id', e.created_by
      )
    FROM expenses e
    WHERE e.paid_at IS NOT NULL
      AND e.created_by IN (SELECT user_id FROM allowed_actors)

    UNION ALL

    -- 3) Invoice submitted
    SELECT
      'invoice_created'::text,
      'invoice'::text,
      i.id,
      i.created_by,
      i.household_id,
      i.category_id,
      i.amount,
      i.created_at,
      jsonb_build_object(
        'invoice_number', i.invoice_number,
        'status', i.status,
        'currency', i.currency,
        'service_date_start', i.service_date_start,
        'service_date_end', i.service_date_end
      )
    FROM contractor_invoices i
    WHERE i.created_by IN (SELECT user_id FROM allowed_actors)

    UNION ALL

    -- 4) Invoice marked paid
    SELECT
      'invoice_paid'::text,
      'invoice'::text,
      i.id,
      NULL::uuid,
      i.household_id,
      i.category_id,
      i.amount,
      i.paid_at,
      jsonb_build_object(
        'invoice_number', i.invoice_number,
        'status', i.status,
        'currency', i.currency,
        'submitter_id', i.created_by
      )
    FROM contractor_invoices i
    WHERE i.status = 'paid'
      AND i.paid_at IS NOT NULL
      AND i.created_by IN (SELECT user_id FROM allowed_actors)

    UNION ALL

    -- 5) Estimate submitted
    SELECT
      'estimate_created'::text,
      'estimate'::text,
      es.id,
      es.created_by,
      es.household_id,
      NULL::uuid,
      NULL::numeric,
      es.created_at,
      jsonb_build_object(
        'title', es.title,
        'billing_type', es.billing_type,
        'status', es.status
      )
    FROM estimates es
    WHERE es.created_by IN (SELECT user_id FROM allowed_actors)

    UNION ALL

    -- 6) Estimate accepted (decider not recorded → system actor)
    SELECT
      'estimate_accepted'::text,
      'estimate'::text,
      es.id,
      NULL::uuid,
      es.household_id,
      NULL::uuid,
      NULL::numeric,
      es.updated_at,
      jsonb_build_object(
        'title', es.title,
        'billing_type', es.billing_type,
        'submitter_id', es.created_by
      )
    FROM estimates es
    WHERE es.status = 'accepted'
      AND es.created_by IN (SELECT user_id FROM allowed_actors)

    UNION ALL

    -- 7) Estimate rejected (decider not recorded → system actor)
    SELECT
      'estimate_rejected'::text,
      'estimate'::text,
      es.id,
      NULL::uuid,
      es.household_id,
      NULL::uuid,
      NULL::numeric,
      es.updated_at,
      jsonb_build_object(
        'title', es.title,
        'billing_type', es.billing_type,
        'submitter_id', es.created_by
      )
    FROM estimates es
    WHERE es.status = 'rejected'
      AND es.created_by IN (SELECT user_id FROM allowed_actors)
  )
  SELECT
    ev.entity_type || ':' || ev.entity_id::text || ':' || ev.event_type
                                                AS event_id,
    ev.event_type,
    ev.entity_type,
    ev.entity_id,
    ev.actor_id,
    COALESCE(
      split_part(au.email, '@', 1),
      '(system)'
    )::text                                     AS actor_username,
    ev.household_id,
    h.name                                      AS household_name,
    ev.category_id,
    ev.amount,
    ev.occurred_at,
    ev.metadata
  FROM events ev
  LEFT JOIN auth.users au ON au.id = ev.actor_id
  LEFT JOIN households h  ON h.id  = ev.household_id
  WHERE ev.occurred_at >= p_start
    AND ev.occurred_at <  p_end
    AND (p_household_id IS NULL OR ev.household_id = p_household_id)
    AND (p_actor_ids IS NULL OR ev.actor_id = ANY (p_actor_ids))
    AND (p_event_types IS NULL OR ev.event_type = ANY (p_event_types))
  ORDER BY ev.occurred_at DESC
  LIMIT 2000;
END;
$$;

REVOKE ALL ON FUNCTION list_team_activity(timestamptz, timestamptz, uuid, uuid[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_team_activity(timestamptz, timestamptz, uuid, uuid[], text[]) TO authenticated;


-- ─── 2. list_estimate_report — per-estimate rows for the report view ─────────
-- Not date-filtered server-side: the frontend date-ranges the summary while
-- the "open & aging" view always considers every currently-open estimate.
CREATE OR REPLACE FUNCTION list_estimate_report(
  p_household_id uuid DEFAULT NULL
)
RETURNS TABLE (
  estimate_id        uuid,
  title              text,
  status             text,
  billing_type       text,
  household_id       uuid,
  household_name     text,
  submitter_id       uuid,
  submitter_username text,
  created_at         timestamptz,
  decided_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (is_admin() OR is_household_admin()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH allowed_actors AS (
    SELECT au.id AS user_id
    FROM auth.users au
    LEFT JOIN user_roles ur ON ur.user_id = au.id
    WHERE
      CASE
        WHEN is_admin() THEN true
        WHEN is_household_admin() THEN
          au.id <> auth.uid()
          AND COALESCE(ur.is_admin, false) = false
          AND COALESCE(ur.is_household_admin, false) = false
          AND EXISTS (
            SELECT 1 FROM household_members hm
            WHERE hm.user_id = au.id
              AND hm.household_id IN (SELECT user_households())
          )
        ELSE false
      END
  )
  SELECT
    e.id,
    e.title,
    e.status,
    e.billing_type,
    e.household_id,
    h.name,
    e.created_by,
    COALESCE(up.username, split_part(au.email, '@', 1), 'unknown')::text,
    e.created_at,
    CASE WHEN e.status <> 'open' THEN e.updated_at ELSE NULL END
  FROM estimates e
  LEFT JOIN households h     ON h.id  = e.household_id
  LEFT JOIN auth.users au    ON au.id = e.created_by
  LEFT JOIN user_profiles up ON up.id = e.created_by
  WHERE e.created_by IN (SELECT user_id FROM allowed_actors)
    AND (p_household_id IS NULL OR e.household_id = p_household_id)
  ORDER BY e.created_at DESC
  LIMIT 2000;
END;
$$;

REVOKE ALL ON FUNCTION list_estimate_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_estimate_report(uuid) TO authenticated;

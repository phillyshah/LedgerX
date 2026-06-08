-- Team activity report RPCs.
--
-- Admins and household_admins get a chronological feed of who-did-what on
-- the receipts and invoices side of LedgerX. Scope rules:
--
--   * Full admins see everyone, across all households.
--   * Household admins see only users in their own households who are
--     neither admins nor household_admins (so contractors + role-less
--     members). They never see themselves, other household_admins, or
--     full admins.
--   * Anyone else gets an empty result — both functions return zero rows
--     without raising so the frontend can fail closed gracefully.
--
-- The data comes from unioning four implicit activity sources:
--   1. expenses.created_at        → receipt submitted
--   2. expenses.paid_at           → expense marked paid (actor unknown)
--   3. contractor_invoices.created_at → invoice submitted
--   4. contractor_invoices.paid_at    → invoice marked paid (status='paid')
--
-- Neither table records WHO marked things paid, so paid-events carry a
-- NULL actor_id and the frontend renders them as "(system)".

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


-- Companion RPC: one row per allowed user with their last sign-in time.
-- Kept separate from the activity feed so the UI can render it as its
-- own tab (one row per user, latest only) without entangling sign-in
-- events with submission events.

CREATE OR REPLACE FUNCTION list_team_member_last_login()
RETURNS TABLE (
  user_id          uuid,
  username         text,
  last_sign_in_at  timestamptz,
  household_names  text[]
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
    SELECT au.id AS uid
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
    au.id                                                AS user_id,
    COALESCE(
      up.username,
      split_part(au.email, '@', 1),
      'unknown'
    )::text                                              AS username,
    au.last_sign_in_at,
    COALESCE(
      ARRAY(
        SELECT h.name
        FROM household_members hm
        JOIN households h ON h.id = hm.household_id
        WHERE hm.user_id = au.id
        ORDER BY h.name
      ),
      ARRAY[]::text[]
    )                                                    AS household_names
  FROM auth.users au
  LEFT JOIN user_profiles up ON up.id = au.id
  WHERE au.id IN (SELECT uid FROM allowed_actors)
  ORDER BY au.last_sign_in_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION list_team_member_last_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_team_member_last_login() TO authenticated;

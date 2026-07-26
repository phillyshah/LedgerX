-- ============================================================
-- Activity report: a household admin couldn't see or filter by their OWN
-- activity (v13.10)
-- ============================================================
--
-- Reported by a household admin (username "onion"): running the Activity
-- report showed nothing they themselves had submitted, and the actor-filter
-- dropdown didn't even offer their own name as an option.
--
-- Root cause: list_team_activity's allowed_actors CTE and its companion
-- list_team_member_last_login (which feeds the actor-filter dropdown) both
-- have, in the household-admin branch:
--     au.id <> auth.uid()
-- This was written to mean "my team, not me" — deliberately excluding the
-- caller's own id from the set of people they're auditing. That reads fine
-- for a full admin auditing everyone, but a household admin IS also a
-- household member who submits their own receipts/invoices/estimates, and
-- there was no path back to their own activity at all: the full-admin branch
-- (`is_admin() THEN true`) has no such exclusion, so this was an asymmetry
-- specific to the household-admin branch, not an intentional access rule.
--
-- Fix: add `au.id = auth.uid() OR (...)` ahead of the existing restricted
-- clause, so the caller's own row is always included regardless of the
-- household/role checks that gate everyone else. Every other restriction is
-- untouched — a household admin still cannot see another admin's or another
-- household's activity; they can now additionally always see their own.
--
-- Full CREATE OR REPLACE of both functions, preserving every existing branch
-- of list_team_activity verbatim (adds no new event type).

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
          au.id = auth.uid()  -- NEW: always see your own activity
          OR (
            au.id <> auth.uid()
            AND COALESCE(ur.is_admin, false) = false
            AND COALESCE(ur.is_household_admin, false) = false
            AND EXISTS (
              SELECT 1 FROM household_members hm
              WHERE hm.user_id = au.id
                AND hm.household_id IN (SELECT user_households())
            )
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

    UNION ALL

    -- 8) Forwarded receipt/invoice still awaiting review (email_inbox
    --    pending). Not yet a real expense/invoice, so household_id/category_id
    --    are unknown (NULL) and amount is deliberately NULL too — the
    --    OCR-guessed total in prefilled is unverified data, not a confirmed
    --    figure, so it doesn't belong in the report's Amount column. The
    --    guessed vendor/subject travel in metadata for display instead.
    SELECT
      'email_pending'::text,
      'email_inbox'::text,
      ei.id,
      ei.user_id,
      NULL::uuid,
      NULL::uuid,
      NULL::numeric,
      ei.received_at,
      jsonb_build_object(
        'kind', ei.kind,
        'from_email', ei.from_email,
        'subject', ei.subject,
        'vendor_guess', ei.prefilled->>'vendor_name'
      )
    FROM email_inbox ei
    WHERE ei.status = 'pending'
      AND ei.user_id IN (SELECT user_id FROM allowed_actors)
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

-- Same fix, same reasoning, for the actor-filter dropdown's data source.
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
          au.id = auth.uid()  -- NEW: always see your own name in the filter
          OR (
            au.id <> auth.uid()
            AND COALESCE(ur.is_admin, false) = false
            AND COALESCE(ur.is_household_admin, false) = false
            AND EXISTS (
              SELECT 1 FROM household_members hm
              WHERE hm.user_id = au.id
                AND hm.household_id IN (SELECT user_households())
            )
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

-- ============================================================
-- Team activity report: surface pending (unreviewed) email-inbox items (v13.7)
-- ============================================================
--
-- Context: a team member forwarded 19 receipts by email; the pipeline
-- processed all of them successfully (confirmed via edge function/poller
-- logs), but none showed up in the Activity report. That turned out to be
-- correct-by-design, not a bug: list_team_activity's
-- "Submitted receipt" event is a live SELECT off `expenses` — it only exists
-- once a human opens the pending email_inbox card and hits Save (which is
-- the same moment that creates the expenses row AND flips the inbox row to
-- 'accepted'). A forwarded email that's still sitting unreviewed in someone's
-- inbox has no expenses row yet, so it correctly produced nothing to show.
--
-- This adds a NEW, distinct event type — 'email_pending' — sourced directly
-- from email_inbox WHERE status='pending', so an admin auditing team activity
-- can see "forwarded something, awaiting review" without it being confused
-- with an actual completed submission. Two behavioral notes worth flagging:
--   1. Unlike every other event type here, this one is NOT a permanent
--      historical record — it's a live snapshot of CURRENT pending state.
--      Once the item is reviewed (accepted or discarded), it naturally drops
--      out of this branch on the next query, since status is no longer
--      'pending'. That's the correct semantic for "awaiting review," not a
--      bug — but it means re-querying a past date range after review won't
--      show it anymore, unlike expense/invoice/estimate events which persist.
--   2. household_id is NULL (email_inbox has no household yet — that's only
--      decided when the item is accepted into a real expense), so filtering
--      the report to one specific household will correctly exclude these
--      rows; only "All households" surfaces them.
--
-- Full CREATE OR REPLACE of list_team_activity, preserving every existing
-- branch (20260608000000, extended by 20260707000000 for estimates) verbatim,
-- plus the new email_pending branch appended at the end.

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

-- ============================================================
-- LedgerX Labs: line-item comments + @mentions + reconciliation report (v13.1)
-- ============================================================
--
-- Two additions to Credit Card Reconciliation:
--   1. Comments on a statement line item, with @mentions that notify the
--      mentioned person (bell + WhatsApp automatic on the notifications
--      insert; email via a new edge function). Models the estimate-chat
--      mention flow (20260715000000): shared parsing (extract_mentions),
--      one audience source of truth, notify trigger + email-recipients RPC.
--   2. A super-admin reconciliation report RPC (which line items are matched,
--      by whom, when) — read-only, modeled on list_estimate_report.
--
-- Safe to re-run.

-- ─── 1. Who can be @mentioned on a reconciliation line item ──────────────────
-- The people worth asking about a charge: every Labs admin (a full admin, or a
-- household admin of a Labs-flagged household), plus everyone who has submitted
-- an expense in a Labs-flagged household (the potential receipt owners).
-- Global to the feature (not per-line-item) — candidate receipts for any one
-- line are a subset of this, and one shared set keeps the picker, the notify
-- trigger, and the email RPC from drifting apart.
CREATE OR REPLACE FUNCTION reconciliation_mentionable()
RETURNS TABLE (uid uuid, username text, hint text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  WITH people AS (
    -- full admins
    SELECT ur.user_id AS uid, 'admin'::text AS hint
    FROM user_roles ur WHERE ur.is_admin
    UNION
    -- household admins of a flagged household
    SELECT ur.user_id, 'household admin'::text
    FROM user_roles ur
    JOIN household_members hm ON hm.user_id = ur.user_id
    JOIN households h ON h.id = hm.household_id
    WHERE ur.is_household_admin
      AND COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
    UNION
    -- submitters of expenses in a flagged household
    SELECT e.created_by, 'submitter'::text
    FROM expenses e
    JOIN households h ON h.id = e.household_id
    WHERE e.created_by IS NOT NULL
      AND COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
  )
  -- collapse duplicates, preferring the most privileged hint per user
  SELECT p.uid,
         up.username,
         (array_agg(p.hint ORDER BY CASE p.hint WHEN 'admin' THEN 0 WHEN 'household admin' THEN 1 ELSE 2 END))[1] AS hint
  FROM people p
  JOIN user_profiles up ON up.id = p.uid
  WHERE is_labs_eligible('labs_cc_reconciliation')   -- only a Labs admin may list them
    AND up.username IS NOT NULL
  GROUP BY p.uid, up.username;
$$;

REVOKE ALL ON FUNCTION reconciliation_mentionable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconciliation_mentionable() TO authenticated;

-- ─── 2. Comments table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statement_line_item_comments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id uuid        NOT NULL REFERENCES statement_line_items(id) ON DELETE CASCADE,
  author_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body         text        NOT NULL CHECK (length(trim(body)) > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statement_line_item_comments_line_idx
  ON statement_line_item_comments(line_item_id, created_at);

ALTER TABLE statement_line_item_comments ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT for Labs admins only (same gate as the line items themselves).
-- INSERT also pins author_id to the caller. No UPDATE/DELETE — comments are
-- immutable, like estimate_messages.
DROP POLICY IF EXISTS "Labs admins read line item comments" ON statement_line_item_comments;
CREATE POLICY "Labs admins read line item comments"
  ON statement_line_item_comments FOR SELECT
  USING (is_labs_eligible('labs_cc_reconciliation'));

DROP POLICY IF EXISTS "Labs admins post line item comments" ON statement_line_item_comments;
CREATE POLICY "Labs admins post line item comments"
  ON statement_line_item_comments FOR INSERT
  WITH CHECK (is_labs_eligible('labs_cc_reconciliation') AND author_id = auth.uid());

-- ─── 3. List a line item's comments (author username resolved) ───────────────
CREATE OR REPLACE FUNCTION list_line_item_comments(p_line_item_id uuid)
RETURNS TABLE (
  id              uuid,
  line_item_id    uuid,
  author_id       uuid,
  author_username text,
  body            text,
  created_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT c.id, c.line_item_id, c.author_id,
         COALESCE(up.username, split_part(au.email, '@', 1), 'user') AS author_username,
         c.body, c.created_at
  FROM statement_line_item_comments c
  LEFT JOIN user_profiles up ON up.id = c.author_id
  LEFT JOIN auth.users au ON au.id = c.author_id
  WHERE c.line_item_id = p_line_item_id
    AND is_labs_eligible('labs_cc_reconciliation')
  ORDER BY c.created_at;
$$;

REVOKE ALL ON FUNCTION list_line_item_comments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_line_item_comments(uuid) TO authenticated;

-- ─── 4. Allow the new notification kind + entity_type ────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'chat_message', 'chat_mention', 'estimate_created', 'estimate_status',
  'invoice_created', 'invoice_paid', 'reconcile_mention'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check CHECK (entity_type IN (
  'estimate', 'invoice', 'statement_line_item'));

-- ─── 5. Notify @mentioned people when a comment is posted ────────────────────
-- Only mentionable people (§1) who were actually @named get a bell row (and,
-- automatically, WhatsApp). The author is never notified. entity_id is the
-- line item; title is a denormalized "description · $amount · Mon DD" so the
-- notification is self-explanatory on any channel.
CREATE OR REPLACE FUNCTION notify_line_item_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mentions text[];
  v_title    text;
BEGIN
  v_mentions := extract_mentions(NEW.body);
  IF array_length(v_mentions, 1) IS NULL THEN
    RETURN NEW;  -- no mentions, nothing to do
  END IF;

  SELECT li.description || ' · $' || trim(to_char(li.amount, 'FM999999990.00'))
         || ' · ' || to_char(li.line_date, 'Mon FMDD')
    INTO v_title
  FROM statement_line_items li WHERE li.id = NEW.line_item_id;

  INSERT INTO notifications (user_id, kind, entity_type, entity_id, household_id, actor_id, title)
  SELECT m.uid, 'reconcile_mention', 'statement_line_item', NEW.line_item_id, NULL, NEW.author_id, v_title
  FROM reconciliation_mentionable() m
  WHERE lower(m.username) = ANY (v_mentions)
    AND m.uid <> NEW.author_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_line_item_comment() FROM PUBLIC;

DROP TRIGGER IF EXISTS line_item_comments_notify ON statement_line_item_comments;
CREATE TRIGGER line_item_comments_notify
  AFTER INSERT ON statement_line_item_comments
  FOR EACH ROW EXECUTE FUNCTION notify_line_item_comment();

-- ─── 6. Email recipients for a reconciliation mention (edge function) ────────
-- Called by the send-reconcile-mention edge function (service role). p_actor is
-- the JWT-derived caller and must itself be Labs-eligible (only Labs admins
-- post comments). Returns deliverable email + language for each @mentioned
-- mentionable user, minus the actor. Also returns the line-item context so the
-- email/WhatsApp body is self-contained.
CREATE OR REPLACE FUNCTION reconciliation_mention_recipients(
  p_line_item_id uuid,
  p_actor        uuid,
  p_body         text
)
RETURNS TABLE (
  email              text,
  preferred_language text,
  username           text,
  can_open           boolean   -- true if this recipient can open the Labs screen
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT up.real_email AS email,
         up.preferred_language,
         up.username,
         EXISTS (
           SELECT 1 FROM user_roles ur
           WHERE ur.user_id = m.uid AND (ur.is_admin OR ur.is_household_admin)
         ) AS can_open
  FROM reconciliation_mentionable() m
  JOIN user_profiles up ON up.id = m.uid
  WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = p_actor AND (ur.is_admin OR ur.is_household_admin)
    )
    AND m.uid <> p_actor
    AND up.real_email IS NOT NULL
    AND up.real_email <> ''
    AND lower(m.username) = ANY (extract_mentions(p_body));
$$;

REVOKE ALL ON FUNCTION reconciliation_mention_recipients(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconciliation_mention_recipients(uuid, uuid, text) TO service_role;

-- ─── 7. Super-admin reconciliation report ────────────────────────────────────
-- Every statement line item with its match status, who reconciled it, and when.
-- Full-admin only (per product: "super-admin report"). SECURITY DEFINER resolves
-- the reconciler's username + matched expense's household regardless of RLS.
CREATE OR REPLACE FUNCTION list_reconciliation_report()
RETURNS TABLE (
  line_item_id          uuid,
  statement_id          uuid,
  card_label            text,
  line_date             date,
  description           text,
  amount                numeric,
  currency              text,
  is_matched            boolean,
  matched_expense_id    uuid,
  matched_household     text,
  matched_by            uuid,
  matched_by_username   text,
  matched_at            timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT
    li.id, li.statement_id, s.card_label, li.line_date, li.description, li.amount, li.currency,
    (li.matched_expense_id IS NOT NULL) AS is_matched,
    li.matched_expense_id,
    mh.name AS matched_household,
    li.matched_by,
    COALESCE(up.username, split_part(au.email, '@', 1)) AS matched_by_username,
    li.matched_at
  FROM statement_line_items li
  JOIN credit_card_statements s ON s.id = li.statement_id
  LEFT JOIN expenses me ON me.id = li.matched_expense_id
  LEFT JOIN households mh ON mh.id = me.household_id
  LEFT JOIN user_profiles up ON up.id = li.matched_by
  LEFT JOIN auth.users au ON au.id = li.matched_by
  WHERE is_admin()   -- super-admin only
  ORDER BY s.card_label, li.line_date, li.description;
$$;

REVOKE ALL ON FUNCTION list_reconciliation_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_reconciliation_report() TO authenticated;

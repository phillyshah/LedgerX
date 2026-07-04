-- ============================================================
-- Migration: @mention notifications in estimate chat (v12.0)
-- ============================================================
--
-- When a chat message names someone with "@username", that person now gets a
-- distinct, stronger signal than the ordinary "new message" nudge:
--   * an in-app bell entry with its own kind ('chat_mention' → "X mentioned you")
--   * an email (sent by the send-mention-notification edge function, which calls
--     estimate_mention_recipients below)
--
-- Only people who can actually SEE the estimate can be mentioned — the same
-- audience the message fan-out already uses (creator ∪ invited participants ∪
-- non-contractor household members ∪ prior posters). A typed @name that isn't in
-- that audience is silently ignored: no bell row, no email, no way to probe who
-- exists or to spam arbitrary users.
--
-- Parsing and the audience live in shared SQL helpers so the trigger (bell) and
-- the recipients RPC (email) can never drift apart.

-- ─── 1. extract_mentions — pull distinct @usernames out of a message body ────
-- Usernames are ^[a-zA-Z0-9_]{3,20}$ (see user_profiles). We match the same
-- shape after an "@", lowercase them, and return a distinct set. IMMUTABLE so it
-- can be used freely in queries.
CREATE OR REPLACE FUNCTION extract_mentions(p_body text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT lower(m[1])), '{}')
  FROM regexp_matches(COALESCE(p_body, ''), '@([A-Za-z0-9_]{3,20})', 'g') AS m;
$$;

-- ─── 2. estimate_audience — everyone who can see an estimate's thread ────────
-- Single source of truth for "who is involved with this estimate", mirroring the
-- recipient union that notify_estimate_message has used since v11.5. SECURITY
-- DEFINER so it can read household_members / participants regardless of caller.
CREATE OR REPLACE FUNCTION estimate_audience(p_estimate_id uuid)
RETURNS TABLE (uid uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  WITH e AS (
    SELECT id, household_id, created_by FROM estimates WHERE id = p_estimate_id
  )
  SELECT DISTINCT r.uid
  FROM (
    SELECT (SELECT created_by FROM e) AS uid
    UNION
    SELECT ep.user_id FROM estimate_participants ep WHERE ep.estimate_id = p_estimate_id
    UNION
    SELECT hm.user_id
    FROM household_members hm
    LEFT JOIN user_roles ur ON ur.user_id = hm.user_id
    WHERE hm.household_id = (SELECT household_id FROM e)
      AND (COALESCE(ur.is_contractor, false) = false OR hm.user_id = (SELECT created_by FROM e))
    UNION
    SELECT m.sender_id FROM estimate_messages m WHERE m.estimate_id = p_estimate_id
  ) r
  WHERE r.uid IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION estimate_audience(uuid) FROM PUBLIC;

-- ─── 3. Allow the new 'chat_mention' notification kind ───────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'chat_message', 'chat_mention', 'estimate_created', 'estimate_status',
  'invoice_created', 'invoice_paid'));

-- ─── 4. Rewrite the chat fan-out to split mentions out of the crowd ──────────
-- Mentioned members get one 'chat_mention' row; everyone else in the audience
-- gets the usual 'chat_message' row. Nobody gets both, and the sender gets
-- neither.
CREATE OR REPLACE FUNCTION notify_estimate_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household uuid;
  v_title     text;
  v_mentions  text[];
BEGIN
  SELECT e.household_id, e.title INTO v_household, v_title
  FROM estimates e WHERE e.id = NEW.estimate_id;

  v_mentions := extract_mentions(NEW.body);

  -- Resolve the audience once, then flag which members were @mentioned.
  WITH aud AS (
    SELECT uid FROM estimate_audience(NEW.estimate_id)
    WHERE uid <> NEW.sender_id
  ),
  tagged AS (
    SELECT a.uid,
           EXISTS (
             SELECT 1 FROM user_profiles up
             WHERE up.id = a.uid
               AND array_length(v_mentions, 1) IS NOT NULL
               AND lower(up.username) = ANY (v_mentions)
           ) AS mentioned
    FROM aud a
  )
  INSERT INTO notifications (user_id, kind, entity_type, entity_id, household_id, actor_id, title)
  SELECT uid,
         CASE WHEN mentioned THEN 'chat_mention' ELSE 'chat_message' END,
         'estimate', NEW.estimate_id, v_household, NEW.sender_id, v_title
  FROM tagged;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_estimate_message() FROM PUBLIC;

-- Trigger definition is unchanged; the CREATE OR REPLACE above swaps the body.

-- ─── 5. estimate_mention_recipients — email targets for a mention ────────────
-- Called by the send-mention-notification edge function (service role). Given a
-- message's estimate, its sender, and its raw body, returns the deliverable
-- email + language for each @mentioned member of the audience (minus the sender).
-- p_actor MUST be the authenticated caller (the edge function derives it from the
-- JWT, never from the request body) and must itself be in the audience — so a
-- member can't fire mention emails on an estimate they have no part in, nor
-- impersonate another member as the sender.
CREATE OR REPLACE FUNCTION estimate_mention_recipients(
  p_estimate_id uuid,
  p_actor       uuid,
  p_body        text
)
RETURNS TABLE (
  email              text,
  preferred_language text,
  username           text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  WITH actor_ok AS (
    SELECT 1 FROM estimate_audience(p_estimate_id) WHERE uid = p_actor
  )
  SELECT up.real_email AS email,
         up.preferred_language,
         up.username
  FROM estimate_audience(p_estimate_id) a
  JOIN user_profiles up ON up.id = a.uid
  WHERE EXISTS (SELECT 1 FROM actor_ok)
    AND a.uid <> p_actor
    AND up.real_email IS NOT NULL
    AND up.real_email <> ''
    -- Array form of ANY: compares against each element of the text[] that
    -- extract_mentions returns. An empty array simply matches no one.
    AND lower(up.username) = ANY (extract_mentions(p_body));
$$;

REVOKE ALL ON FUNCTION estimate_mention_recipients(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION estimate_mention_recipients(uuid, uuid, text) TO service_role;

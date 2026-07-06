-- ============================================================
-- Migration: WhatsApp integration via Twilio (v12.2)
-- ============================================================
--
-- Users can WhatsApp the LedgerX number to create expenses/invoices/estimates,
-- add photos to existing records, and pull the keyword reports — and the
-- system can push notifications to WhatsApp per a per-user channel preference.
--
--   * user_phone_numbers      — admin-assigned phone → user allow-list
--                               (mirrors user_sender_emails, but globally
--                               unique and admin-managed)
--   * user_profiles.notify_channel — 'email' | 'whatsapp' | 'both'
--   * whatsapp_sessions       — per-phone conversation state for the bot's
--                               multi-turn draft/confirm flow (service-role only)
--   * whatsapp_inbound_dedup  — Twilio MessageSid idempotency guard
--   * whatsapp_outbox         — queued outbound notifications, fanned out by a
--                               trigger on notifications, drained by pg_cron →
--                               whatsapp-send edge function every minute
--
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / guarded DO blocks).
--
-- Cron prerequisite (already configured live for the inactivity reminder):
--   ALTER DATABASE postgres SET app.supabase_url = 'https://<project>.supabase.co';
--   ALTER DATABASE postgres SET app.cron_secret  = '<a long random string>';
-- Verify with:
--   SELECT current_setting('app.supabase_url', true), current_setting('app.cron_secret', true) IS NOT NULL;

-- ─── 1. user_phone_numbers ───────────────────────────────────────────────────
-- Unlike user_sender_emails (owner-managed, UNIQUE(user_id,email)), a phone is
-- globally unique — an inbound WhatsApp message must resolve to exactly one
-- user — and only full admins may assign numbers (allow-list model).
CREATE TABLE IF NOT EXISTS user_phone_numbers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone           text        NOT NULL UNIQUE,   -- E.164, e.g. +14155551234 (no "whatsapp:" prefix)
  label           text,                          -- optional nickname, e.g. "Personal"
  last_inbound_at timestamptz,                   -- last user→bot message; drives the 24h free-form window
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (phone ~ '^\+[1-9][0-9]{6,14}$')
);

ALTER TABLE user_phone_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_phone_numbers: owner select" ON user_phone_numbers;
CREATE POLICY "user_phone_numbers: owner select"
  ON user_phone_numbers FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_phone_numbers: admin all" ON user_phone_numbers;
CREATE POLICY "user_phone_numbers: admin all"
  ON user_phone_numbers FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── 2. Sender resolution + inbound-window tracking (service role) ───────────
CREATE OR REPLACE FUNCTION resolve_sender_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT user_id
  FROM   user_phone_numbers
  WHERE  phone = p_phone
  LIMIT  1;
$$;

REVOKE ALL ON FUNCTION resolve_sender_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_sender_phone(text) TO service_role;

CREATE OR REPLACE FUNCTION touch_phone_inbound(p_phone text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE user_phone_numbers
  SET    last_inbound_at = now()
  WHERE  phone = p_phone;
$$;

REVOKE ALL ON FUNCTION touch_phone_inbound(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION touch_phone_inbound(text) TO service_role;

-- ─── 3. Notification channel preference ──────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notify_channel text NOT NULL DEFAULT 'email';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_notify_channel_check'
      AND conrelid = 'user_profiles'::regclass
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_notify_channel_check
      CHECK (notify_channel IN ('email', 'whatsapp', 'both'));
  END IF;
END $$;

-- Owner-facing setter (validates the enum; immune to UPDATE-policy column
-- drift — same rationale as admin_update_user_language).
CREATE OR REPLACE FUNCTION set_notify_channel(p_channel text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_channel NOT IN ('email', 'whatsapp', 'both') THEN
    RAISE EXCEPTION 'Invalid channel: %', p_channel;
  END IF;

  UPDATE user_profiles
  SET    notify_channel = p_channel
  WHERE  id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION set_notify_channel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_notify_channel(text) TO authenticated;

-- ─── 4. whatsapp_sessions — bot conversation state ───────────────────────────
-- One row per phone. pending_action holds the draft:
--   { intent, fields: {...}, staged_media: [{path, mime}], candidates: [...] }
-- Service-role only: RLS enabled with no policies.
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone          text        PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state          text        NOT NULL DEFAULT 'idle'
                             CHECK (state IN ('idle', 'collecting', 'choosing_target', 'awaiting_confirmation')),
  pending_action jsonb,
  llm_calls      int         NOT NULL DEFAULT 0,   -- rate-cap counter
  llm_window_start timestamptz,                    -- start of the current rate window
  updated_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz                       -- past this ⇒ treated as idle
);

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- ─── 5. whatsapp_inbound_dedup — Twilio retry idempotency ────────────────────
-- The webhook INSERTs the MessageSid ON CONFLICT DO NOTHING; a conflict means
-- Twilio re-delivered and processing is skipped. Purged after 7 days by the
-- whatsapp-send housekeeping pass.
CREATE TABLE IF NOT EXISTS whatsapp_inbound_dedup (
  message_sid text        PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_inbound_dedup ENABLE ROW LEVEL SECURITY;

-- ─── 6. whatsapp_outbox — queued outbound notifications ─────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone           text        NOT NULL,
  -- { kind, entity_type, entity_id, household_id, title, actor_username, lang }
  payload         jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts        int         NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

CREATE INDEX IF NOT EXISTS whatsapp_outbox_pending_idx
  ON whatsapp_outbox(status, next_attempt_at);

ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;

-- Admins can inspect the queue for support; nobody else sees it. Writes are
-- trigger/RPC-only (service role bypasses RLS).
DROP POLICY IF EXISTS "whatsapp_outbox: admin select" ON whatsapp_outbox;
CREATE POLICY "whatsapp_outbox: admin select"
  ON whatsapp_outbox FOR SELECT
  USING (is_admin());

-- ─── 7. Fan-out trigger: notifications → whatsapp_outbox ────────────────────
-- Piggybacks on the recipient logic the v11.5 notify_* triggers already
-- compute: every notifications row IS a correctly-scoped recipient. We only
-- add channel/phone filtering here, so all kinds (chat_message, chat_mention,
-- estimate_created/status, invoice_created/paid) fan out uniformly.
CREATE OR REPLACE FUNCTION enqueue_whatsapp_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone    text;
  v_channel  text;
  v_lang     text;
  v_actor    text;
BEGIN
  SELECT up.notify_channel, up.preferred_language
    INTO v_channel, v_lang
  FROM user_profiles up WHERE up.id = NEW.user_id;

  IF v_channel IS NULL OR v_channel = 'email' THEN
    RETURN NEW;
  END IF;

  SELECT upn.phone INTO v_phone
  FROM user_phone_numbers upn
  WHERE upn.user_id = NEW.user_id
  ORDER BY upn.created_at ASC
  LIMIT 1;

  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- Username only — never real emails (CLAUDE.md rule).
  SELECT up2.username INTO v_actor
  FROM user_profiles up2 WHERE up2.id = NEW.actor_id;

  INSERT INTO whatsapp_outbox (user_id, phone, payload)
  VALUES (
    NEW.user_id,
    v_phone,
    jsonb_build_object(
      'kind',           NEW.kind,
      'entity_type',    NEW.entity_type,
      'entity_id',      NEW.entity_id,
      'household_id',   NEW.household_id,
      'title',          NEW.title,
      'actor_username', v_actor,
      'lang',           COALESCE(v_lang, 'en')
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_whatsapp_notification() FROM PUBLIC;

DROP TRIGGER IF EXISTS notifications_enqueue_whatsapp ON notifications;
CREATE TRIGGER notifications_enqueue_whatsapp
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION enqueue_whatsapp_notification();

-- ─── 8. Outbox drain RPCs (service role) ─────────────────────────────────────
-- PostgREST can't express FOR UPDATE SKIP LOCKED, so claiming happens in a
-- SECURITY DEFINER function — safe even if two cron ticks overlap. Claiming
-- also pushes next_attempt_at forward (a 5-minute lease): a claimed row whose
-- worker dies before finish_whatsapp_outbox() simply becomes claimable again
-- after the lease, instead of being re-sent by the very next tick.
CREATE OR REPLACE FUNCTION claim_whatsapp_outbox(p_limit int DEFAULT 20)
RETURNS SETOF whatsapp_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE whatsapp_outbox o
  SET    attempts = o.attempts + 1,
         next_attempt_at = now() + interval '5 minutes'
  WHERE  o.id IN (
    SELECT id FROM whatsapp_outbox
    WHERE  status = 'pending'
      AND  next_attempt_at <= now()
    ORDER BY created_at
    LIMIT  GREATEST(COALESCE(p_limit, 20), 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION claim_whatsapp_outbox(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_whatsapp_outbox(int) TO service_role;

-- Terminal statuses stick; a 'failed' with attempts < 4 is requeued with a
-- linear backoff so transient Twilio 5xx/429s retry, then give up.
CREATE OR REPLACE FUNCTION finish_whatsapp_outbox(p_id uuid, p_status text, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts int;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Invalid outbox status: %', p_status;
  END IF;

  SELECT attempts INTO v_attempts FROM whatsapp_outbox WHERE id = p_id;
  IF v_attempts IS NULL THEN
    RETURN;  -- row vanished; nothing to do
  END IF;

  IF p_status = 'failed' AND v_attempts < 4 THEN
    UPDATE whatsapp_outbox
    SET    status = 'pending',
           next_attempt_at = now() + (v_attempts * interval '5 minutes'),
           last_error = p_error
    WHERE  id = p_id;
  ELSE
    UPDATE whatsapp_outbox
    SET    status = p_status,
           sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
           last_error = COALESCE(p_error, last_error)
    WHERE  id = p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION finish_whatsapp_outbox(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finish_whatsapp_outbox(uuid, text, text) TO service_role;

-- Housekeeping helper used by whatsapp-send: purge old dedup rows.
CREATE OR REPLACE FUNCTION purge_whatsapp_dedup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM whatsapp_inbound_dedup
  WHERE received_at < now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION purge_whatsapp_dedup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_whatsapp_dedup() TO service_role;

-- ─── 9. Bot context — one round trip per inbound message ─────────────────────
-- Explicit p_user_id because the bot runs as service role (auth.uid() is NULL)
-- — same convention as email_command_report/pending/activity.
CREATE OR REPLACE FUNCTION whatsapp_bot_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT jsonb_build_object(
    'is_admin',           COALESCE(ur.is_admin, false),
    'is_household_admin', COALESCE(ur.is_household_admin, false),
    'is_contractor',      COALESCE(ur.is_contractor, false),
    'username',           up.username,
    'preferred_language', COALESCE(up.preferred_language, 'en'),
    'notify_channel',     COALESCE(up.notify_channel, 'email'),
    'households',         COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) ORDER BY h.name)
      FROM household_members hm
      JOIN households h ON h.id = hm.household_id
      WHERE hm.user_id = p_user_id
    ), '[]'::jsonb)
  )
  FROM user_profiles up
  LEFT JOIN user_roles ur ON ur.user_id = up.id
  WHERE up.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION whatsapp_bot_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION whatsapp_bot_context(uuid) TO service_role;

-- ─── 10. pg_cron: drain the outbox every minute ──────────────────────────────
DO $$
DECLARE
  v_url text;
  v_secret text;
  v_existing_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron extension not installed — skipping whatsapp-outbox-drain cron schedule. Install pg_cron and re-run the scheduling block to enable.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net extension not installed — skipping whatsapp-outbox-drain cron schedule. Install pg_net and re-run the scheduling block to enable.';
    RETURN;
  END IF;

  v_url := current_setting('app.supabase_url', true);
  v_secret := current_setting('app.cron_secret', true);

  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE 'app.supabase_url or app.cron_secret not set — skipping whatsapp-outbox-drain cron schedule. See migration header for setup instructions.';
    RETURN;
  END IF;

  -- Replace any previous schedule so re-running this is safe.
  SELECT jobid INTO v_existing_jobid
    FROM cron.job WHERE jobname = 'ledgerx-whatsapp-outbox-drain';

  IF v_existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_jobid);
  END IF;

  PERFORM cron.schedule(
    'ledgerx-whatsapp-outbox-drain',
    '* * * * *', -- every minute; the function no-ops when the queue is empty
    format(
      $job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Secret', %L
        ),
        body := '{}'::jsonb
      );
      $job$,
      rtrim(v_url, '/') || '/functions/v1/whatsapp-send',
      v_secret
    )
  );

  RAISE NOTICE 'Scheduled ledgerx-whatsapp-outbox-drain (every minute).';
END $$;

-- Minimal email inbox schema.
--
-- Two tables + one helper RPC. The inbox row stores the email exactly as it
-- arrived (from, subject, body_text, body_html, attachment paths) so the
-- consuming application can do whatever it wants with it.

-- ─── user_sender_emails ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sender_emails (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  label       text,                              -- optional nickname e.g. "Gmail"
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

ALTER TABLE user_sender_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sender_emails: owner select"
  ON user_sender_emails FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_sender_emails: owner insert"
  ON user_sender_emails FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_sender_emails: owner delete"
  ON user_sender_emails FOR DELETE USING (auth.uid() = user_id);

-- ─── email_inbox ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_inbox (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_email       text        NOT NULL,
  subject          text,
  body_text        text,
  body_html        text,
  attachment_paths jsonb       NOT NULL DEFAULT '[]',
  message_id       text,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'discarded')),
  received_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_inbox: owner select"
  ON email_inbox FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "email_inbox: owner update"
  ON email_inbox FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- INSERT is service-role only — the edge function uses the service key.

-- ─── Dedup index ─────────────────────────────────────────────────────────────
-- Not a UNIQUE constraint. The edge function dedupes on
-- (user_id, message_id, status='pending') so a user can discard a card
-- and re-forward the same email later without it being silently dropped.
CREATE INDEX IF NOT EXISTS email_inbox_message_id_idx
  ON email_inbox (message_id) WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_inbox_user_status_idx
  ON email_inbox (user_id, status, received_at DESC);

-- ─── resolve_sender_email RPC ────────────────────────────────────────────────
-- Lets the service-role edge function look up the user_id for a sender
-- address without exposing user_sender_emails to anon.
CREATE OR REPLACE FUNCTION resolve_sender_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT user_id
  FROM   user_sender_emails
  WHERE  lower(email) = lower(p_email)
  LIMIT  1;
$$;

REVOKE ALL ON FUNCTION resolve_sender_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_sender_email(text) TO service_role;

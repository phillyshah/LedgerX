-- Email Inbox — schema, RLS, sender → user lookup RPC.
--
-- Apply as a single migration. Tables:
--   user_sender_emails  — addresses each user is allowed to forward from
--   email_inbox         — pending drafts created by the inbound-email edge
--                         function. RLS scopes by user_id; INSERT only via
--                         service_role.
--
-- The resolve_sender_email() RPC lets the edge function map a sender address
-- to a user_id without ever exposing the user_sender_emails table to anon.

-- ─── user_sender_emails ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sender_emails (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  label       text,                              -- optional nickname e.g. "Gmail", "Work"
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

ALTER TABLE user_sender_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sender_emails: owner select"
  ON user_sender_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_sender_emails: owner insert"
  ON user_sender_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_sender_emails: owner delete"
  ON user_sender_emails FOR DELETE
  USING (auth.uid() = user_id);

-- ─── email_inbox ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_inbox (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_email       text        NOT NULL,
  subject          text,
  received_at      timestamptz NOT NULL DEFAULT now(),
  -- Storage paths of uploaded attachments (array of paths in your bucket)
  attachment_paths jsonb       NOT NULL DEFAULT '[]',
  -- App-specific classification (keyword heuristic in the edge function).
  -- TODO: change the allowed values to fit your domain.
  kind             text        NOT NULL DEFAULT 'default'
                               CHECK (kind IN ('default', 'expense', 'invoice')),
  -- OCR-prefilled form data — shape defined by your edge function.
  prefilled        jsonb       NOT NULL DEFAULT '{}',
  -- Review status. Cards only show 'pending'.
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'discarded')),
  -- IMAP Message-ID header — used for per-user dedup of pending rows
  message_id       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_inbox: owner select"
  ON email_inbox FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "email_inbox: owner update"
  ON email_inbox FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INSERT is service-role only — the edge function uses the service key.

-- ─── Dedup index ─────────────────────────────────────────────────────────────
-- NOT a UNIQUE constraint. Dedup is enforced in the edge function with the
-- predicate (user_id, message_id, status='pending'). This lets a user discard
-- a card and then re-forward the same email later if they change their mind;
-- the second copy creates a new pending row instead of vanishing.
CREATE INDEX IF NOT EXISTS email_inbox_message_id_idx
  ON email_inbox (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_inbox_user_status_idx
  ON email_inbox (user_id, status, received_at DESC);

-- ─── resolve_sender_email RPC ────────────────────────────────────────────────
-- SECURITY DEFINER so the service-role edge function can look up the
-- user_id for a sender address without granting it broad access to
-- user_sender_emails. Case-insensitive match.
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

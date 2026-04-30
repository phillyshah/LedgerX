-- ============================================================
-- Email inbox: inbound-email forwarding feature
-- ============================================================
-- Two tables:
--   user_sender_emails  — trusted sender addresses per user (many per user)
--   email_inbox         — pending drafts created by the polling system
-- ============================================================

-- -------------------------------------------------------
-- 1. user_sender_emails
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sender_emails (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  label       text,                          -- optional nickname, e.g. "Gmail", "Work"
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

ALTER TABLE user_sender_emails ENABLE ROW LEVEL SECURITY;

-- Users manage their own sender addresses
CREATE POLICY "user_sender_emails: owner select"
  ON user_sender_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_sender_emails: owner insert"
  ON user_sender_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_sender_emails: owner delete"
  ON user_sender_emails FOR DELETE
  USING (auth.uid() = user_id);

-- Service role (edge function) needs to look up sender → user mapping
-- This is handled via SECURITY DEFINER function below.

-- -------------------------------------------------------
-- 2. email_inbox
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_inbox (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_email       text        NOT NULL,
  subject          text,
  received_at      timestamptz NOT NULL DEFAULT now(),
  -- Storage paths of uploaded attachments (array of paths in 'receipts' bucket)
  attachment_paths jsonb       NOT NULL DEFAULT '[]',
  -- Best-guess at whether this is a receipt or invoice
  kind             text        NOT NULL DEFAULT 'expense'
                               CHECK (kind IN ('expense', 'invoice')),
  -- OCR-prefilled form data (vendor, total, date, notes, invoice_number, etc.)
  prefilled        jsonb       NOT NULL DEFAULT '{}',
  -- Review status
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'discarded')),
  -- IMAP Message-ID header — prevents double-processing the same email
  message_id       text        UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_inbox ENABLE ROW LEVEL SECURITY;

-- Users see their own inbox items
CREATE POLICY "email_inbox: owner select"
  ON email_inbox FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update status (accept / discard) on their own items
CREATE POLICY "email_inbox: owner update"
  ON email_inbox FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INSERT is done by the service-role edge function only — no user policy needed.
-- Admins can see all inbox items for support purposes
CREATE POLICY "email_inbox: admin select"
  ON email_inbox FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

-- -------------------------------------------------------
-- 3. SECURITY DEFINER helper — lets the edge function
--    resolve a sender email to a user_id without exposing
--    the full user_sender_emails table to the anon role.
-- -------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION resolve_sender_email(text) TO service_role;

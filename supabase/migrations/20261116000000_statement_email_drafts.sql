-- ============================================================
-- Migration: email-a-statement draft state (v13.24)
-- ============================================================
--
-- Lets a full admin start a credit-card statement by emailing it to
-- receipts@90ten.life, review what OCR extracted in a reply, correct it over
-- one or more email round-trips, and confirm — at which point the real
-- credit_card_statements + statement_line_items rows are created and the
-- statement appears in Reconciliation exactly as an in-app upload would.
--
-- Why a separate draft table rather than an 'draft' status on
-- credit_card_statements: a half-reviewed extraction is NOT a statement. The
-- reconciliation screen, the matching RPCs and the report all assume every
-- credit_card_statements row is real. Parking unreviewed OCR output there
-- would surface it in matching candidates and the household-scoped views
-- before a human had agreed any of it is correct. Confirming is what
-- promotes a draft into those tables, and until then this holds everything.
--
-- Shape mirrors whatsapp_sessions (20260717000000): one row of conversation
-- state, service-role written, with the payload in jsonb.

CREATE TABLE IF NOT EXISTS statement_email_drafts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short handle echoed in the reply subject as [LX-XXXXXX]. The thread is
  -- matched on THIS, not on In-Reply-To/References: the IMAP poller does not
  -- forward those headers, and a subject token survives forwards, mobile
  -- clients that rewrite threading headers, and a fresh compose.
  token          text        NOT NULL UNIQUE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Statement metadata, all correctable by email before confirming.
  card_label     text,
  period_start   date,
  period_end     date,
  household_ids  uuid[]      NOT NULL DEFAULT '{}',

  -- The original attachment, already in the private receipts bucket. Carried
  -- over to credit_card_statements.file_path on confirm so the finished
  -- statement keeps its source document.
  file_path      text,
  file_mime      text,
  source_type    text        NOT NULL DEFAULT 'pdf'
                             CHECK (source_type IN ('csv', 'pdf', 'image')),

  -- [{ "date": "YYYY-MM-DD", "description": "...", "amount": 12.34 }, ...]
  -- Ordered; the 1-based position in this array is the line number the admin
  -- edits by in their reply.
  line_items     jsonb       NOT NULL DEFAULT '[]'::jsonb,

  status         text        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'confirmed', 'cancelled', 'error')),
  error_message  text,
  -- Set on confirm; the statement this draft became.
  statement_id   uuid        REFERENCES credit_card_statements(id) ON DELETE SET NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- A draft nobody confirms is abandoned, not pending forever. Past this the
  -- edge function treats a reply as unmatched and says the draft expired.
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX IF NOT EXISTS statement_email_drafts_user_idx
  ON statement_email_drafts(user_id, status);

ALTER TABLE statement_email_drafts ENABLE ROW LEVEL SECURITY;

-- Writes are service-role only (the edge function owns this table), but
-- admins can READ their drafts so the state is inspectable from the SQL
-- editor without reaching for the service key, and so a future UI can list
-- in-flight drafts without another migration.
DROP POLICY IF EXISTS "Admins view statement email drafts" ON statement_email_drafts;
CREATE POLICY "Admins view statement email drafts"
  ON statement_email_drafts FOR SELECT
  USING (is_admin());

COMMENT ON TABLE statement_email_drafts IS
  'In-flight email-to-statement conversations. A draft is NOT a statement; '
  'confirming it creates the credit_card_statements row. See 20261116000000.';

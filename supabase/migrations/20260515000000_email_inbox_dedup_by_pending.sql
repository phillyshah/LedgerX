-- ============================================================
-- email_inbox: switch dedup from "ever-seen" to "still-pending"
-- ============================================================
-- The UNIQUE constraint on message_id prevented re-forwarding any email
-- the user had already acted on (discarded or accepted). The edge function
-- now dedupes against (user_id, message_id, status='pending'), so a fresh
-- forward after a discard creates a new pending row instead of vanishing.
--
-- We keep an index on message_id so the dedup lookup stays fast.
-- ============================================================

ALTER TABLE email_inbox DROP CONSTRAINT IF EXISTS email_inbox_message_id_key;

CREATE INDEX IF NOT EXISTS email_inbox_message_id_idx
  ON email_inbox (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_inbox_user_status_idx
  ON email_inbox (user_id, status, received_at DESC);

-- ============================================================
-- Migration: In-app notifications (v11.5)
-- ============================================================
--
-- Backs the header bell (repurposed from "What's New", which moved to the
-- footer in v11.3). A durable per-recipient notifications feed populated by
-- SECURITY DEFINER triggers on the events users care about:
--
--   * chat_message      — a new message on an estimate you're involved in
--   * estimate_created  — a new estimate submitted in your household
--   * estimate_status   — an estimate you're involved in was accepted/rejected
--   * invoice_created   — a new invoice submitted in your household
--   * invoice_paid      — an invoice you're involved in was marked paid
--
-- Recipient rules mirror household_activity_recipients (20260708000000): the
-- actor is never notified of their own action, and contractors only hear about
-- items they created. Resolved to user_id (not email) for in-app delivery.
-- Receipts/expenses are intentionally out of scope (same as the email nudges).
--
-- Reads follow the estimate_reads pattern: a per-row read_at pointer, exposed
-- through list_notifications() / mark_notifications_read() RPCs.

-- ─── 1. Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
  kind         text        NOT NULL CHECK (kind IN (
                             'chat_message', 'estimate_created', 'estimate_status',
                             'invoice_created', 'invoice_paid')),
  entity_type  text        NOT NULL CHECK (entity_type IN ('estimate', 'invoice')),
  entity_id    uuid        NOT NULL,
  household_id uuid,
  actor_id     uuid,       -- who triggered it (may be null for system actions)
  title        text,       -- denormalized label (estimate title / invoice number) for display
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON notifications(entity_type, entity_id);

-- ─── 2. RLS — owners read/update their own rows only; triggers write ──────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Only read_at is ever changed by clients (via the RPC). No client INSERT/DELETE
-- policy exists, so rows can only be created by the SECURITY DEFINER triggers.
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── 3. Fan-out trigger: new estimate ────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_estimate_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    RETURN NEW;  -- can't scope recipients without a household
  END IF;

  INSERT INTO notifications (user_id, kind, entity_type, entity_id, household_id, actor_id, title)
  SELECT DISTINCT hm.user_id, 'estimate_created', 'estimate', NEW.id, NEW.household_id, NEW.created_by, NEW.title
  FROM household_members hm
  LEFT JOIN user_roles ur ON ur.user_id = hm.user_id
  WHERE hm.household_id = NEW.household_id
    AND hm.user_id <> NEW.created_by
    AND (COALESCE(ur.is_contractor, false) = false OR hm.user_id = NEW.created_by);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_notify_created ON estimates;
CREATE TRIGGER estimates_notify_created
  AFTER INSERT ON estimates
  FOR EACH ROW EXECUTE FUNCTION notify_estimate_created();

-- ─── 4. Fan-out trigger: estimate status change ──────────────────────────────
CREATE OR REPLACE FUNCTION notify_estimate_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('accepted', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- The creator especially wants the outcome; also the household (minus
  -- non-creator contractors). Exclude whoever made the change.
  INSERT INTO notifications (user_id, kind, entity_type, entity_id, household_id, actor_id, title)
  SELECT DISTINCT r.uid, 'estimate_status', 'estimate', NEW.id, NEW.household_id, auth.uid(), NEW.title
  FROM (
    SELECT NEW.created_by AS uid
    UNION
    SELECT hm.user_id
    FROM household_members hm
    LEFT JOIN user_roles ur ON ur.user_id = hm.user_id
    WHERE hm.household_id = NEW.household_id
      AND (COALESCE(ur.is_contractor, false) = false OR hm.user_id = NEW.created_by)
  ) r
  WHERE r.uid IS NOT NULL
    AND (auth.uid() IS NULL OR r.uid <> auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_notify_status ON estimates;
CREATE TRIGGER estimates_notify_status
  AFTER UPDATE OF status ON estimates
  FOR EACH ROW EXECUTE FUNCTION notify_estimate_status();

-- ─── 5. Fan-out trigger: new estimate chat message ───────────────────────────
CREATE OR REPLACE FUNCTION notify_estimate_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_household uuid;
  v_creator   uuid;
  v_title     text;
BEGIN
  SELECT e.household_id, e.created_by, e.title
    INTO v_household, v_creator, v_title
  FROM estimates e WHERE e.id = NEW.estimate_id;

  -- Everyone involved with this estimate, minus the sender: the creator,
  -- invited participants, non-contractor household members (or the creator),
  -- and anyone who has already posted in the thread.
  INSERT INTO notifications (user_id, kind, entity_type, entity_id, household_id, actor_id, title)
  SELECT DISTINCT r.uid, 'chat_message', 'estimate', NEW.estimate_id, v_household, NEW.sender_id, v_title
  FROM (
    SELECT v_creator AS uid
    UNION
    SELECT ep.user_id FROM estimate_participants ep WHERE ep.estimate_id = NEW.estimate_id
    UNION
    SELECT hm.user_id
    FROM household_members hm
    LEFT JOIN user_roles ur ON ur.user_id = hm.user_id
    WHERE hm.household_id = v_household
      AND (COALESCE(ur.is_contractor, false) = false OR hm.user_id = v_creator)
    UNION
    SELECT m.sender_id FROM estimate_messages m WHERE m.estimate_id = NEW.estimate_id
  ) r
  WHERE r.uid IS NOT NULL
    AND r.uid <> NEW.sender_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimate_messages_notify ON estimate_messages;
CREATE TRIGGER estimate_messages_notify
  AFTER INSERT ON estimate_messages
  FOR EACH ROW EXECUTE FUNCTION notify_estimate_message();

-- ─── 6. Fan-out trigger: new invoice ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_invoice_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, kind, entity_type, entity_id, household_id, actor_id, title)
  SELECT DISTINCT hm.user_id, 'invoice_created', 'invoice', NEW.id, NEW.household_id, NEW.created_by, NEW.invoice_number
  FROM household_members hm
  LEFT JOIN user_roles ur ON ur.user_id = hm.user_id
  WHERE hm.household_id = NEW.household_id
    AND hm.user_id <> NEW.created_by
    AND (COALESCE(ur.is_contractor, false) = false OR hm.user_id = NEW.created_by);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_notify_created ON contractor_invoices;
CREATE TRIGGER invoices_notify_created
  AFTER INSERT ON contractor_invoices
  FOR EACH ROW EXECUTE FUNCTION notify_invoice_created();

-- ─── 7. Fan-out trigger: invoice marked paid ─────────────────────────────────
CREATE OR REPLACE FUNCTION notify_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'paid' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, kind, entity_type, entity_id, household_id, actor_id, title)
  SELECT DISTINCT r.uid, 'invoice_paid', 'invoice', NEW.id, NEW.household_id, auth.uid(), NEW.invoice_number
  FROM (
    SELECT NEW.created_by AS uid
    UNION
    SELECT hm.user_id
    FROM household_members hm
    LEFT JOIN user_roles ur ON ur.user_id = hm.user_id
    WHERE hm.household_id = NEW.household_id
      AND (COALESCE(ur.is_contractor, false) = false OR hm.user_id = NEW.created_by)
  ) r
  WHERE r.uid IS NOT NULL
    AND (auth.uid() IS NULL OR r.uid <> auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_notify_paid ON contractor_invoices;
CREATE TRIGGER invoices_notify_paid
  AFTER UPDATE OF status ON contractor_invoices
  FOR EACH ROW EXECUTE FUNCTION notify_invoice_paid();

-- ─── 8. RPC: list my notifications (newest first) ────────────────────────────
CREATE OR REPLACE FUNCTION list_notifications(p_limit int DEFAULT 30)
RETURNS TABLE (
  id            uuid,
  kind          text,
  entity_type   text,
  entity_id     uuid,
  household_id  uuid,
  actor_id      uuid,
  actor_username text,
  title         text,
  created_at    timestamptz,
  read_at       timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT n.id, n.kind, n.entity_type, n.entity_id, n.household_id, n.actor_id,
         split_part(u.email, '@', 1) AS actor_username,   -- never expose real emails
         n.title, n.created_at, n.read_at
  FROM notifications n
  LEFT JOIN auth.users u ON u.id = n.actor_id
  WHERE n.user_id = auth.uid()
  ORDER BY n.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION list_notifications(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_notifications(int) TO authenticated;

-- ─── 9. RPC: mark read (all, or a specific set) ──────────────────────────────
CREATE OR REPLACE FUNCTION mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE notifications
  SET read_at = now()
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND (p_ids IS NULL OR id = ANY (p_ids));
$$;

REVOKE ALL ON FUNCTION mark_notifications_read(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_notifications_read(uuid[]) TO authenticated;

-- Notifications + work-evidence photos (v10.1)
--
-- 1) Adds an `is_work_evidence` flag to expense_images and invoice_images so
--    contractor work-in-progress photos can be stored alongside the receipt /
--    invoice scan but visually separated in review UIs.
--
-- 2) Creates a `notification_log` table that the edge functions write to when
--    they send an email. Two purposes:
--      a) audit / debugging — "did the contractor-submission email actually
--         leave the building?"
--      b) cadence enforcement for the inactivity-reminder loop so admins
--         aren't spammed (escalating: 14d, then 30d, then monthly).
--
-- 3) Adds a SQL function `get_user_last_activity(uuid)` that returns the
--    most recent of: auth.users.last_sign_in_at, last expense created, last
--    invoice created. Used by the inactivity reminder edge function and is
--    intentionally available to authenticated callers (your own user) too.
--
-- 4) Optionally schedules the daily inactivity reminder via pg_cron + pg_net.
--    The schedule is only created when `app.supabase_url` and
--    `app.cron_secret` are configured at the database level — otherwise the
--    migration is a no-op for the schedule (a NOTICE is raised) and the cron
--    can be enabled later by re-running the scheduling block manually. See
--    README for the exact `ALTER DATABASE ... SET` commands.

-- 1. is_work_evidence flag ---------------------------------------------------

ALTER TABLE expense_images
  ADD COLUMN IF NOT EXISTS is_work_evidence boolean NOT NULL DEFAULT false;

ALTER TABLE invoice_images
  ADD COLUMN IF NOT EXISTS is_work_evidence boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS expense_images_work_evidence_idx
  ON expense_images(expense_id) WHERE is_work_evidence = true;

CREATE INDEX IF NOT EXISTS invoice_images_work_evidence_idx
  ON invoice_images(invoice_id) WHERE is_work_evidence = true;


-- 2. notification_log --------------------------------------------------------

CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'submission_invoice',
    'submission_expense',
    'inactivity_reminder'
  )),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_log_user_kind_idx
  ON notification_log(user_id, kind, sent_at DESC);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Owners can read their own log entries (useful for a future "notification
-- history" UI; for now just keeps the table queryable by the user).
DROP POLICY IF EXISTS "users_read_own_notification_log" ON notification_log;
CREATE POLICY "users_read_own_notification_log"
  ON notification_log FOR SELECT
  USING (auth.uid() = user_id);

-- Full admins can read everything for debugging.
DROP POLICY IF EXISTS "admins_read_all_notification_log" ON notification_log;
CREATE POLICY "admins_read_all_notification_log"
  ON notification_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true)
  );

-- No INSERT/UPDATE/DELETE policies — writes happen exclusively via the
-- service role from edge functions.


-- 3. get_user_last_activity --------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_last_activity(target_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT GREATEST(
    COALESCE((SELECT last_sign_in_at FROM auth.users WHERE id = target_user_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM expenses WHERE created_by = target_user_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM contractor_invoices WHERE created_by = target_user_id), 'epoch'::timestamptz)
  );
$$;

GRANT EXECUTE ON FUNCTION get_user_last_activity(uuid) TO authenticated, service_role;


-- 4. Daily inactivity-reminder schedule (opt-in via DB settings) -------------
--
-- To enable, run these on the database once:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://<project>.supabase.co';
--   ALTER DATABASE postgres SET app.cron_secret  = '<a long random string>';
--   SELECT pg_reload_conf();
--
-- Then re-run this DO block (or the SELECT cron.schedule call below) to
-- create the job. The same CRON_SECRET must be set in the edge function's
-- environment so the function can verify the incoming call.

DO $$
DECLARE
  v_url text;
  v_secret text;
  v_existing_jobid bigint;
BEGIN
  -- Require both pg_cron and pg_net to exist. On hosted Supabase both are
  -- available but the user must enable them once via the dashboard or
  -- `CREATE EXTENSION`. We don't try to create them here because that
  -- requires superuser and would fail noisily during a normal migration.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron extension not installed — skipping inactivity-reminder cron schedule. Install pg_cron and re-run the scheduling block to enable.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net extension not installed — skipping inactivity-reminder cron schedule. Install pg_net and re-run the scheduling block to enable.';
    RETURN;
  END IF;

  v_url := current_setting('app.supabase_url', true);
  v_secret := current_setting('app.cron_secret', true);

  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE 'app.supabase_url or app.cron_secret not set — skipping inactivity-reminder cron schedule. See migration header for setup instructions.';
    RETURN;
  END IF;

  -- Replace any previous schedule so re-running this is safe.
  SELECT jobid INTO v_existing_jobid
    FROM cron.job WHERE jobname = 'ledgerx-inactivity-reminders-daily';

  IF v_existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_jobid);
  END IF;

  PERFORM cron.schedule(
    'ledgerx-inactivity-reminders-daily',
    '0 14 * * *', -- 14:00 UTC daily (morning in the US, mid-afternoon BR)
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
      rtrim(v_url, '/') || '/functions/v1/send-inactivity-reminder',
      v_secret
    )
  );

  RAISE NOTICE 'Scheduled ledgerx-inactivity-reminders-daily (14:00 UTC daily).';
END $$;

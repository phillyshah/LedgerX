-- Harden get_user_last_activity (follow-up to 20260524000000).
--
-- Two fixes flagged in code review:
--
-- 1) "Never active" should return NULL, not epoch. The previous version
--    COALESCEd every source to 'epoch', so an account that has never signed
--    in and filed nothing returned 1970-01-01. The inactivity-reminder cron
--    then computed ~20000 days inactive and emailed brand-new admins a
--    "we miss you" nudge on their very first day. Returning NULL lets the
--    cron skip these users cleanly.
--
-- 2) Tighten the grant. The function is SECURITY DEFINER (bypasses RLS), so
--    granting EXECUTE to `authenticated` let any logged-in user read any
--    other user's last sign-in / activity time by passing an arbitrary uuid.
--    Only the cron edge function needs it, and that runs as service_role —
--    so we revoke from authenticated.

CREATE OR REPLACE FUNCTION get_user_last_activity(target_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT NULLIF(
    GREATEST(
      COALESCE((SELECT last_sign_in_at FROM auth.users WHERE id = target_user_id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(created_at) FROM expenses WHERE created_by = target_user_id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(created_at) FROM contractor_invoices WHERE created_by = target_user_id), 'epoch'::timestamptz)
    ),
    'epoch'::timestamptz
  );
$$;

REVOKE EXECUTE ON FUNCTION get_user_last_activity(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_user_last_activity(uuid) TO service_role;

-- ============================================================
-- Fix: estimate_participants had RLS enabled with ZERO SELECT policies.
-- ============================================================
--
-- estimate_participants was intentionally built "no direct client access,
-- only via SECURITY DEFINER RPCs" (see 20260705000000_estimate_participants.sql).
-- But several OTHER tables' RLS policies (estimates, estimate_attachments,
-- estimate_messages — both SELECT and INSERT) reference estimate_participants
-- via a plain EXISTS subquery to check "is this user an invited participant".
-- Those subqueries run as the CALLING USER's role, not with elevated
-- privileges, so they are themselves subject to RLS on estimate_participants.
-- With no SELECT policy there, every such EXISTS silently evaluates to zero
-- rows for any ordinary authenticated user — even for their own participant
-- record — so "invited participant" access was broken everywhere except
-- paths that go through a SECURITY DEFINER function (e.g. list_visible_estimates()).
--
-- Symptom: an invited contractor could see an estimate (via the RPC) but a
-- direct INSERT into estimate_messages 403'd, because the INSERT policy's
-- participant check couldn't see the very row proving they were invited.
--
-- Fix: let a user see their own estimate_participants row. This is the
-- minimal grant needed to unblock every dependent EXISTS check; it exposes
-- nothing beyond "which estimates am I invited to and by whom", which the
-- invited user is entitled to know about themselves anyway.

DROP POLICY IF EXISTS "Users view own participant rows" ON estimate_participants;
CREATE POLICY "Users view own participant rows"
  ON estimate_participants FOR SELECT
  USING (user_id = auth.uid());

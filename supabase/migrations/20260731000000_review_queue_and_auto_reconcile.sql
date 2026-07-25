-- ============================================================
-- Review queue (bell + 3-day email reminder) and global Auto Reconcile (v13.8)
-- ============================================================
--
-- Two user-reported problems, one migration.
--
-- 1. FORWARDED RECEIPTS GO STALE SILENTLY. A team member forwards a receipt,
--    it lands in email_inbox as 'pending', and then nothing chases it. The
--    only surface is a collapsible panel that hides itself entirely at zero,
--    and the notification bell — the thing users actually watch — reads only
--    the `notifications` table and knows nothing about it. In production this
--    produced a 24-item backlog nobody noticed. Same story for transactions
--    saved without a category.
--
--    Fix: review_queue_summary() feeds a live count into the bell, and
--    list_review_reminder_recipients() feeds a daily cron that emails the
--    OWNER of anything sitting unreviewed for more than 3 days.
--
--    Deliberately NOT modelled as `notifications` rows: that table is a
--    durable, trigger-written, row-per-event log with mark-read/delete
--    semantics. "You have 4 things waiting" is a live count, not an event —
--    as rows it would need dedup, invalidation on review, and would break
--    mark-read. The bell composes it as a pinned summary above the feed.
--
-- 2. RECONCILIATION IS TRAPPED PER-STATEMENT. Auto-match only ever considers
--    one statement's unmatched line items against that statement's scoped
--    pool. There is no way to sweep everything at once.
--
--    Fix: list_unlinked_expenses() (the expenses-with-no-card-charge
--    anti-join, which did not exist in any form) plus
--    list_open_statement_line_items() (every open charge across every
--    visible statement, carrying its household tags) give the client the
--    full cross-product. Scoring stays entirely client-side in
--    statementMatching.ts — unchanged, so global and per-statement
--    auto-match agree by construction.
--
-- Access note: Auto Reconcile is for household admins and above, but
-- inbox-sourced matching was full-admin-only (20260728000000) because
-- email_inbox has no household_id and there was no grounded scoping rule.
-- A household admin would therefore get an inbox-blind sweep. This adds one:
-- can_see_inbox_item() — a household admin sees pending inbox rows forwarded
-- by members of THEIR households who are not themselves admins. That is the
-- same shape as the expense-side creator filter in
-- list_reconciliation_candidates, so it introduces no new class of
-- visibility. It is factored into a helper used by BOTH the list and the
-- write path, the same discipline as can_act_on_expense() — so a direct RPC
-- call can never see more than the list showed.
--
-- Safe to re-run.

-- ─── 1. "Uncategorized" now includes expenses with no category at all ────────
-- admin_get_uncategorized_expenses (20260210184842) matched only orphaned
-- households and INVALID categories — an expense with category IS NULL was
-- literally uncategorized yet absent from the Uncategorized screen. That gap
-- matters now: the bell and the reminder email both count these, and a count
-- that disagrees with the screen it links to is worse than no count.
-- Signature unchanged, so CREATE OR REPLACE is enough (no DROP needed).
CREATE OR REPLACE FUNCTION admin_get_uncategorized_expenses()
RETURNS TABLE (
  id uuid,
  household_id uuid,
  household_name text,
  created_by uuid,
  creator_email text,
  expense_date date,
  vendor text,
  total numeric,
  currency text,
  category text,
  notes text,
  transcript text,
  image_path text,
  image_mime text,
  image_width integer,
  image_height integer,
  created_at timestamptz,
  updated_at timestamptz,
  is_orphaned_household boolean,
  is_invalid_category boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can view uncategorized expenses';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.household_id,
    h.name as household_name,
    e.created_by,
    COALESCE(up.username, 'Unknown')::text as creator_email,
    e.expense_date::date,
    e.vendor,
    e.total,
    e.currency,
    e.category,
    e.notes,
    e.transcript,
    e.image_path,
    e.image_mime,
    e.image_width,
    e.image_height,
    e.created_at,
    e.updated_at,
    (e.household_id IS NULL) as is_orphaned_household,
    (
      e.category IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM categories c
        WHERE c.name = e.category
        AND (c.household_id IS NULL OR c.household_id = e.household_id)
      )
    ) as is_invalid_category
  FROM expenses e
  LEFT JOIN households h ON h.id = e.household_id
  LEFT JOIN user_profiles up ON up.id = e.created_by
  WHERE
    e.household_id IS NULL
    OR e.category IS NULL          -- NEW: no category at all
    OR (
      e.category IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM categories c
        WHERE c.name = e.category
        AND (c.household_id IS NULL OR c.household_id = e.household_id)
      )
    )
  ORDER BY e.expense_date DESC, e.created_at DESC;
END;
$$;

-- Shared predicate so the bell count, the reminder email and the admin
-- screen can never drift apart. Immutable-ish helper, no auth logic —
-- callers apply their own scoping on top.
CREATE OR REPLACE FUNCTION expense_needs_attention(
  p_household_id uuid,
  p_category     text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    p_household_id IS NULL
    OR p_category IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM categories c
      WHERE c.name = p_category
        AND (c.household_id IS NULL OR c.household_id = p_household_id)
    );
$$;

REVOKE ALL ON FUNCTION expense_needs_attention(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expense_needs_attention(uuid, text) TO authenticated, service_role;

-- ─── 2. review_queue_summary() — live counts for the notification bell ───────
-- Counted in SQL rather than derived from a fetched array on purpose: the
-- bell's existing unread count is computed from list_notifications(p_limit
-- := 30), so it silently saturates at 30. A count query has no such ceiling.
--
-- Scoping mirrors what each role can already act on, so no new visibility is
-- created:
--   * inbox   — always strictly the caller's own rows (email_inbox is a
--               per-user staging table; even full admins review their own).
--   * expenses— full admin: everything, because the admin Uncategorized screen
--               is system-wide and the count must match the screen it links
--               to. EVERYONE ELSE (including household admins): their own
--               submissions only. A household admin has no household-wide
--               uncategorized screen, so counting their members' expenses
--               would show a number with nowhere to go — and it would also
--               disagree with the reminder email, which is owner-scoped by
--               design.
CREATE OR REPLACE FUNCTION review_queue_summary()
RETURNS TABLE (
  pending_inbox          integer,
  uncategorized_expenses integer,
  oldest_pending_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  WITH inbox AS (
    SELECT ei.received_at
    FROM email_inbox ei
    WHERE ei.user_id = auth.uid()
      AND ei.status = 'pending'
  ),
  stale AS (
    SELECT e.created_at
    FROM expenses e
    WHERE expense_needs_attention(e.household_id, e.category)
      AND (is_admin() OR e.created_by = auth.uid())
  )
  SELECT
    (SELECT count(*) FROM inbox)::integer,
    (SELECT count(*) FROM stale)::integer,
    LEAST(
      (SELECT min(received_at) FROM inbox),
      (SELECT min(created_at)  FROM stale)
    );
$$;

REVOKE ALL ON FUNCTION review_queue_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_queue_summary() TO authenticated;

-- ─── 3. Reminder recipients — one row per user with something stale ──────────
-- service_role ONLY: this returns real contact email addresses, the same
-- reason reconciliation_mention_recipients (20260726000000) is restricted.
-- Never grant to `authenticated`.
--
-- "Owner" is deliberate — the forwarder of the email, or whoever saved the
-- uncategorized transaction. They are the one who can actually resolve it,
-- and it keeps admin inboxes quiet.
--
-- Users with no real_email are simply absent (same partial-coverage
-- behaviour as every other send-* function; internal @ledgerx.local
-- addresses are not deliverable).
CREATE OR REPLACE FUNCTION list_review_reminder_recipients(p_days integer DEFAULT 3)
RETURNS TABLE (
  user_id                uuid,
  email                  text,
  username               text,
  preferred_language     text,
  notify_channel         text,
  pending_inbox          integer,
  uncategorized_expenses integer,
  oldest_at              timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  WITH cutoff AS (
    SELECT now() - make_interval(days => GREATEST(COALESCE(p_days, 3), 0)) AS ts
  ),
  inbox AS (
    SELECT ei.user_id, count(*)::integer AS n, min(ei.received_at) AS oldest
    FROM email_inbox ei, cutoff
    WHERE ei.status = 'pending'
      AND ei.received_at < cutoff.ts
    GROUP BY ei.user_id
  ),
  stale AS (
    SELECT e.created_by AS user_id, count(*)::integer AS n, min(e.created_at) AS oldest
    FROM expenses e, cutoff
    WHERE e.created_at < cutoff.ts
      AND expense_needs_attention(e.household_id, e.category)
    GROUP BY e.created_by
  ),
  combined AS (
    SELECT COALESCE(i.user_id, s.user_id) AS user_id,
           COALESCE(i.n, 0)               AS pending_inbox,
           COALESCE(s.n, 0)               AS uncategorized_expenses,
           LEAST(i.oldest, s.oldest)      AS oldest_at
    FROM inbox i
    FULL OUTER JOIN stale s ON s.user_id = i.user_id
  )
  SELECT
    c.user_id,
    COALESCE(NULLIF(up.real_email, ''), up.email)::text,
    COALESCE(up.username, 'there')::text,
    COALESCE(up.preferred_language, 'en')::text,
    COALESCE(up.notify_channel, 'email')::text,
    c.pending_inbox,
    c.uncategorized_expenses,
    -- LEAST() ignores NULLs (only all-NULL yields NULL), so a user with only
    -- one kind of stale item still gets that item's timestamp.
    c.oldest_at
  FROM combined c
  JOIN user_profiles up ON up.id = c.user_id
  WHERE (c.pending_inbox + c.uncategorized_expenses) > 0
    AND COALESCE(NULLIF(up.real_email, ''), up.email) IS NOT NULL
    AND COALESCE(NULLIF(up.real_email, ''), up.email) NOT LIKE '%@ledgerx.local';
$$;

-- REVOKE FROM PUBLIC alone is NOT enough here. Supabase's platform default
-- privileges grant EXECUTE on new public-schema functions directly to
-- `anon` and `authenticated` — an explicit grant that revoking PUBLIC does
-- not touch. Since this function returns real contact email addresses (the
-- one thing CLAUDE.md says never to expose), revoke those roles by name too.
REVOKE ALL ON FUNCTION list_review_reminder_recipients(integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION list_review_reminder_recipients(integer) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION list_review_reminder_recipients(integer) FROM authenticated';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION list_review_reminder_recipients(integer) TO service_role;

-- The anti-spam ledger the reminder cadence is enforced against. Adding a
-- kind requires widening the CHECK — it is not an enum.
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_kind_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_kind_check CHECK (kind IN (
  'submission_invoice',
  'submission_expense',
  'inactivity_reminder',
  'review_reminder'
));

-- ─── 4. Inbox visibility, factored so list and write path cannot drift ───────
-- Full admin  → every pending inbox row.
-- Household admin → rows forwarded by a member of one of THEIR households
--                   who is not themselves an admin/household admin.
-- Anyone else → nothing (their own inbox is reached through RLS, not here).
CREATE OR REPLACE FUNCTION can_see_inbox_item(p_inbox_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM email_inbox ei
    WHERE ei.id = p_inbox_id
      AND (
        is_admin()
        OR (
          is_household_admin()
          AND EXISTS (
            SELECT 1 FROM household_members hm
            WHERE hm.user_id = ei.user_id
              AND hm.household_id IN (SELECT user_households())
          )
          AND NOT EXISTS (
            SELECT 1 FROM user_roles r
            WHERE r.user_id = ei.user_id
              AND (r.is_admin OR r.is_household_admin)
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION can_see_inbox_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_see_inbox_item(uuid) TO authenticated;

-- Widen the candidate list to match. Shape is unchanged, so the client
-- adapter (inboxCandidateToExpense) needs no edit.
CREATE OR REPLACE FUNCTION list_reconciliation_inbox_candidates()
RETURNS TABLE (
  id                 uuid,
  from_email         text,
  subject            text,
  received_at        timestamptz,
  attachment_paths   jsonb,
  vendor             text,
  total              numeric,
  expense_date       date,
  notes              text,
  submitter_user_id  uuid,
  submitter_username text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    ei.id,
    ei.from_email,
    ei.subject,
    ei.received_at,
    ei.attachment_paths,
    NULLIF(btrim(COALESCE(ei.prefilled->>'vendor_name', '')), ''),
    (ei.prefilled->>'total_amount')::numeric,
    COALESCE((ei.prefilled->>'transaction_date')::date, ei.received_at::date),
    NULLIF(btrim(COALESCE(ei.prefilled->>'handwritten_notes', '')), ''),
    ei.user_id,
    up.username
  FROM email_inbox ei
  LEFT JOIN user_profiles up ON up.id = ei.user_id
  WHERE is_labs_eligible('labs_cc_reconciliation')
    AND ei.status = 'pending'
    AND ei.kind = 'expense'
    AND (ei.prefilled->>'total_amount') IS NOT NULL
    AND can_see_inbox_item(ei.id);
$$;

REVOKE ALL ON FUNCTION list_reconciliation_inbox_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_reconciliation_inbox_candidates() TO authenticated;

-- Confirming an inbox match must follow the same widening, otherwise a
-- household admin sees rows they cannot act on. Two independent checks: they
-- must be able to SEE the inbox item, and — unless they are a full admin —
-- the destination household must be one of their own.
CREATE OR REPLACE FUNCTION match_inbox_item_to_line_item(
  p_line_item_id uuid,
  p_inbox_id     uuid,
  p_household_id uuid,
  p_category     text DEFAULT NULL,
  p_images       jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inbox      email_inbox%ROWTYPE;
  v_expense_id uuid;
  v_image      jsonb;
  v_idx        int := 0;
  v_first_path text;
  v_first_mime text;
  v_first_w    int;
  v_first_h    int;
BEGIN
  IF NOT is_labs_eligible('labs_cc_reconciliation') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT can_see_inbox_item(p_inbox_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- A household admin can only file the receipt into a household they
  -- actually administer; a full admin may file it anywhere.
  IF NOT is_admin() AND p_household_id NOT IN (SELECT user_households()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_inbox FROM email_inbox WHERE id = p_inbox_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inbox item not found or already processed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM households WHERE id = p_household_id) THEN
    RAISE EXCEPTION 'household not found';
  END IF;

  IF jsonb_array_length(COALESCE(p_images, '[]'::jsonb)) > 0 THEN
    v_image := p_images->0;
    v_first_path := v_image->>'path';
    v_first_mime := v_image->>'mime';
    v_first_w    := NULLIF(v_image->>'width', '')::int;
    v_first_h    := NULLIF(v_image->>'height', '')::int;
  END IF;

  INSERT INTO expenses (
    household_id, created_by, expense_date, vendor, total, category, notes,
    image_path, image_mime, image_width, image_height
  )
  VALUES (
    p_household_id,
    v_inbox.user_id,
    COALESCE((v_inbox.prefilled->>'transaction_date')::date, v_inbox.received_at::date),
    NULLIF(btrim(COALESCE(v_inbox.prefilled->>'vendor_name', '')), ''),
    COALESCE((v_inbox.prefilled->>'total_amount')::numeric, 0),
    NULLIF(btrim(COALESCE(p_category, '')), ''),
    NULLIF(btrim(COALESCE(v_inbox.prefilled->>'handwritten_notes', '')), ''),
    v_first_path, v_first_mime, v_first_w, v_first_h
  )
  RETURNING id INTO v_expense_id;

  FOR v_image IN SELECT * FROM jsonb_array_elements(COALESCE(p_images, '[]'::jsonb))
  LOOP
    INSERT INTO expense_images (expense_id, image_path, image_mime, image_width, image_height, display_order)
    VALUES (
      v_expense_id,
      v_image->>'path',
      v_image->>'mime',
      NULLIF(v_image->>'width', '')::int,
      NULLIF(v_image->>'height', '')::int,
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE email_inbox SET status = 'accepted' WHERE id = p_inbox_id;

  UPDATE statement_line_items
  SET    matched_expense_id = v_expense_id,
         matched_at = now(),
         matched_by = auth.uid()
  WHERE  id = p_line_item_id
    AND  matched_expense_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'line item already matched';
  END IF;

  RETURN v_expense_id;
END;
$$;

REVOKE ALL ON FUNCTION match_inbox_item_to_line_item(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_inbox_item_to_line_item(uuid, uuid, uuid, text, jsonb) TO authenticated;

-- ─── 5. Global Auto Reconcile: the two halves of the cross-product ───────────
-- The existing unique index is `WHERE matched_expense_id IS NOT NULL`, so it
-- cannot serve the NULL-side probe an anti-join needs. Plain index for that.
CREATE INDEX IF NOT EXISTS statement_line_items_matched_expense_lookup_idx
  ON statement_line_items (matched_expense_id);

-- Every expense not yet claimed by ANY statement. Column shape is identical
-- to list_reconciliation_candidates so the client mapping is shared.
-- Authorization is the same predicate as that function — copied verbatim
-- rather than re-derived, because it is deliberately mirrored in
-- can_act_on_expense() to keep the list and the permission in lockstep.
CREATE OR REPLACE FUNCTION list_unlinked_expenses()
RETURNS TABLE (
  id             uuid,
  expense_date   date,
  vendor         text,
  total          numeric,
  currency       text,
  category       text,
  notes          text,
  transcript     text,
  household_id   uuid,
  household_name text,
  image_path     text,
  image_mime     text,
  image_width    integer,
  image_height   integer,
  created_by     uuid,
  submitter_username text,
  paid_at        timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    e.id, e.expense_date, e.vendor, e.total, e.currency, e.category, e.notes, e.transcript,
    e.household_id, h.name AS household_name,
    e.image_path, e.image_mime, e.image_width, e.image_height,
    e.created_by, up.username AS submitter_username, e.paid_at
  FROM expenses e
  JOIN households h ON h.id = e.household_id
  LEFT JOIN user_profiles up ON up.id = e.created_by
  WHERE is_labs_eligible('labs_cc_reconciliation')
    AND NOT EXISTS (
      SELECT 1 FROM statement_line_items li WHERE li.matched_expense_id = e.id
    )
    AND (
      is_admin()  -- full admin: every household, every submitter
      OR (
        COALESCE((h.features_enabled->>'labs_cc_reconciliation')::boolean, false)
        AND (
          e.created_by = auth.uid()  -- own submissions
          OR NOT EXISTS (            -- or a regular user / contractor (not an admin/HA)
            SELECT 1 FROM user_roles r
            WHERE r.user_id = e.created_by
              AND (r.is_admin OR r.is_household_admin)
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION list_unlinked_expenses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_unlinked_expenses() TO authenticated;

-- Every open (unmatched) charge across every statement the caller can see,
-- carrying its statement's household tags. Those tags are what let Auto
-- Reconcile DERIVE a household for an inbox receipt: an email_inbox row has
-- no household_id, but if the charge it matches sits on a statement tagged
-- to exactly one property, the household is implied rather than asked for.
-- household_ids is empty for an untagged statement — the client then falls
-- back to prompting, same as the per-statement flow does today.
CREATE OR REPLACE FUNCTION list_open_statement_line_items()
RETURNS TABLE (
  id            uuid,
  statement_id  uuid,
  card_label    text,
  line_date     date,
  description   text,
  amount        numeric,
  currency      text,
  household_ids uuid[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    li.id,
    li.statement_id,
    s.card_label,
    li.line_date,
    li.description,
    li.amount,
    li.currency,
    COALESCE(
      ARRAY(
        SELECT sh.household_id
        FROM statement_households sh
        WHERE sh.statement_id = s.id
        ORDER BY sh.household_id
      ),
      ARRAY[]::uuid[]
    )
  FROM statement_line_items li
  JOIN credit_card_statements s ON s.id = li.statement_id
  WHERE is_labs_eligible('labs_cc_reconciliation')
    AND li.matched_expense_id IS NULL
    AND s.status = 'ready';
$$;

REVOKE ALL ON FUNCTION list_open_statement_line_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_open_statement_line_items() TO authenticated;

-- ─── 6. Hardening: close the same privilege gap on existing backend-only RPCs ─
-- Writing the reminder RPC surfaced a general trap. Every backend-only
-- function in this project follows the pattern
--     REVOKE ALL ON FUNCTION f() FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION f() TO service_role;
-- which reads as "service role only" but is not. Supabase's platform default
-- privileges grant EXECUTE on each newly-created public-schema function
-- directly to `anon` and `authenticated`; revoking PUBLIC does not remove an
-- explicit role grant, so those functions stayed callable by any logged-in
-- user. Several of them return real contact email addresses — which CLAUDE.md
-- specifically forbids exposing — and two are mutations.
--
-- 20260525000000_harden_last_activity_fn.sql already did this by hand for
-- get_user_last_activity, so the intent is established; this generalizes it.
-- Verified against the frontend first: none of these are called from src/
-- (the only two textual hits are a code comment and a generated type), so
-- revoking cannot break a client call path.
DO $$
DECLARE
  v_fn   text;
  v_args text;
  v_role text;
BEGIN
  FOR v_fn, v_args IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'reconciliation_mention_recipients',
        'household_activity_recipients',
        'estimate_mention_recipients',
        'email_command_report',
        'email_command_pending',
        'email_command_activity',
        'resolve_sender_email',
        'resolve_sender_phone',
        'whatsapp_bot_context',
        'claim_whatsapp_outbox',
        'finish_whatsapp_outbox',
        'touch_phone_inbound',
        'purge_whatsapp_dedup'
      )
  LOOP
    -- PUBLIC first, and it must NOT go through %I — that would quote it into a
    -- literal role named "PUBLIC" rather than the pseudo-role. This matters:
    -- several of these functions (e.g. resolve_sender_email, 20260430000000:104)
    -- only ever had a GRANT and never a REVOKE FROM PUBLIC, so they still carry
    -- the default EXECUTE that Postgres puts on every new function. Every role
    -- inherits PUBLIC, so revoking anon/authenticated by name accomplishes
    -- nothing on its own for those — verified in production, where
    -- resolve_sender_email's ACL still read `=X/postgres` afterwards.
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', v_fn, v_args);

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM %I', v_fn, v_args, v_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ─── 7. Daily review-reminder cron ───────────────────────────────────────────
-- ⚠️ On hosted Supabase `ALTER DATABASE postgres SET app.* = …` fails — the
-- SQL-editor role is not the DB owner. Use a session-level SET immediately
-- followed by this block, IN THE SAME SQL-EDITOR RUN:
--
--   SET app.supabase_url = 'https://<project>.supabase.co';
--   SET app.cron_secret  = '<the CRON_SECRET edge secret>';
--   -- then paste the DO block below and Run everything together
--
-- The scheduled command bakes the literal URL/secret into cron.job.command
-- via format(%L), so the GUC only needs to exist for that one execution.
-- Verify afterwards with: SELECT jobname, schedule FROM cron.job;
DO $$
DECLARE
  v_url text;
  v_secret text;
  v_existing_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron extension not installed — skipping review-reminder cron schedule.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net extension not installed — skipping review-reminder cron schedule.';
    RETURN;
  END IF;

  v_url := current_setting('app.supabase_url', true);
  v_secret := current_setting('app.cron_secret', true);

  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE 'app.supabase_url or app.cron_secret not set — skipping review-reminder cron schedule. See migration header for setup instructions.';
    RETURN;
  END IF;

  -- Replace any previous schedule so re-running this is safe.
  SELECT jobid INTO v_existing_jobid
    FROM cron.job WHERE jobname = 'ledgerx-review-reminders-daily';

  IF v_existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_jobid);
  END IF;

  PERFORM cron.schedule(
    'ledgerx-review-reminders-daily',
    '0 15 * * *', -- 15:00 UTC daily; the function no-ops when nothing is stale
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
      rtrim(v_url, '/') || '/functions/v1/send-review-reminder',
      v_secret
    )
  );

  RAISE NOTICE 'Scheduled ledgerx-review-reminders-daily (15:00 UTC).';
END $$;

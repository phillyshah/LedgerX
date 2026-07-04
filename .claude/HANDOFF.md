# Session Handoff

**Read first.** Current state + hard-won environment/deploy lessons. The other
`.claude/*.md` docs cover durable architecture. Update this at the end of any
substantial session.

## Current state

- **Version `v11.6`** (`src/version.ts` / `package.json`). CLAUDE.md's "v7.8" is stale.
- **Branch**: `claude/add-setup-for-all-users-ZsXaT` (rolling; reused every session).
  Before starting: `git fetch origin main && git log origin/main..HEAD` — if empty,
  `git checkout -B <branch> origin/main` to start fresh on top of merged work.
- **⚠️ Pending manual step**: the v11.5 notifications migration
  `supabase/migrations/20260710000000_notifications.sql` must be pasted+run in the
  **Supabase SQL editor** (it's idempotent). Confirm it's applied — without it the
  bell is silently empty (RPC returns nothing; no crash).

## Environment (no CLI — everything manual via dashboard)

- **Supabase** project ref `bkxccrbfjoqtxbtekrgw`. **No CLI linked.** Schema changes:
  paste full SQL into the **SQL editor**. Edge functions: paste into the dashboard
  **Edge Functions** editor → Deploy. Always hand the user the full SQL/code.
- **Deploy frontend** (Hostinger VPS `72.62.174.193`, repo at `/opt/LedgerX`, Traefik):
  `cd /opt/LedgerX && git pull origin main && npm ci && npm run build && sudo rsync -avz --delete dist/ /var/www/ledger.90ten.life/`
  Prod: `https://ledger.90ten.life` (old `ledger.phillyshah.com` 301s to it).
- **Email**: `receipts@90ten.life` (Hostinger mailbox) → VPS IMAP cron → `inbound-email`
  edge fn (shared `INBOUND_EMAIL_SECRET`); also routes `help`/`estimates`/`invoices`
  subjects to `email-command`. Outbound via **Resend** (`RESEND_API_KEY`); sending
  domain `90ten.life` is DKIM/SPF/MX-verified in Resend (via Hostinger DNS).
- Edge secrets already set: `OPENAI_API_KEY`, `INBOUND_EMAIL_SECRET`, `RESEND_API_KEY`,
  `NOTIFICATION_FROM_EMAIL`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Features shipped (this session, v11.3–v11.6)

| Ver | What | Key files |
|---|---|---|
| v11.3 | Simpler home: lead w/ actions + Transactions; Summary+Charts folded into one collapsed **Insights** section; What's New moved from header bell → footer link (`AppFooter`); bell removed | `Dashboard.tsx`, `AppFooter.tsx` |
| v11.4 | Household admins can submit estimates (added Submit Estimate to HA quick-action row; RLS already allowed it — was UI-only) | `admin/AdminLayout.tsx` |
| v11.5 | **Notifications bell** (real): new chat msg / new estimate / estimate accepted-rejected / new invoice / invoice paid | `20260710000000_notifications.sql`, `useNotifications.ts`, `NotificationBell.tsx` |
| v11.6 | Logo is a **Home button** on every screen (resets view/modals + scrolls top; admins→home, HAs→invoices) | `Dashboard.tsx`, `admin/AdminLayout.tsx` |

## Decisions (don't re-litigate)

- **Notifications scope** = chat + estimate/invoice created + status changes. **Not**
  receipts/expenses. Recipients mirror `household_activity_recipients`: never the
  actor; contractors only hear about items they created; creator always hears
  outcomes. Bell v1 = count + list + mark-read; **no deep-link yet** (fast-follow).
- **i18n**: all UI labels/aria in en+pt-BR; chat *message content* is NOT translated.
- **Estimate submit** open to any authenticated user (RLS `WITH CHECK (auth.uid()=created_by)`).
  **Estimate chat**: creator/admins/participants always; non-contractor household
  members yes; contractors read-only unless creator/invited/admin.
- **Email-command auth** = sender address must match `user_profiles.real_email` (via
  `resolve_sender_email`). No tokens/allowlist.

## Deploy gotchas (learned the hard way)

1. **PR can lag your last push.** Always `git log origin/main..HEAD` before saying
   "deployed"; rebase + `--force-with-lease` + fresh PR if it shows commits.
2. **Migrations don't self-apply** — a repo file means nothing until run in the SQL
   editor. When unsure of live state, give the user a `pg_policy`/`information_schema` query.
3. **Edge server-to-server auth**: don't rely on the dashboard "Verify JWT" toggle
   (flaky/hidden). Send service-role key as `Authorization: Bearer` + a shared secret
   in the request body, verified in-function.
4. **New Resend domain silently 403s** until DKIM/SPF/MX verified. Ask "is the
   from-domain verified?" first when outbound mail doesn't arrive.
5. **RLS-referenced-table trap**: a table with RLS on but *no policy for an op*
   silently denies it — including inside another table's policy `EXISTS` subquery
   (runs as the caller). If a perm bug survives ruling out policy text + token +
   payload, suspect a referenced table's missing RLS (fixed once via a
   `USING (user_id=auth.uid())` SELECT policy on `estimate_participants`).

## Migrations (in `supabase/migrations/`, chronological tail)

`20260704…any_user_submit_estimates` · `…705 estimate_participants` ·
`…706 household_members_estimate_chat` · `…707 estimate_reports` ·
`…708 email_commands_and_household_activity` · `…709 fix_estimate_participants_select` ·
**`…710 notifications`  ← confirm applied**

## Open items

1. **Apply `20260710000000_notifications.sql`** in Supabase (if not already).
2. **Notification deep-linking** — tapping a row only marks read; wiring click→open
   the specific estimate/invoice across both shells is a deliberate fast-follow.
3. **`inbound-email` drift** — deployed (dashboard) version is older than repo
   (weaker dedup, no HEIC filter); only the command-dispatch block was patched live.
4. **`ashesh.shah@gmail.com` = Andy's `real_email`?** — confirm intentional.
5. **`.claude/ARCHITECTURE.md` stale** (predates contractors/invoices/estimates/reports).

## Resume checklist

1. Read CLAUDE.md (auto) + this file.
2. `git fetch origin main && git log origin/main --oneline -8`; check open PRs.
3. Confirm live version at `https://ledger.90ten.life` footer.
4. Work on branch `claude/add-setup-for-all-users-ZsXaT`; follow the version-bump /
   i18n(en+pt-BR) / README×2 / releaseNotes+emoji rules in CLAUDE.md; push to `origin/main` via PR.

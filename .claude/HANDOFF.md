# Session Handoff

**Read this first in any new thread.** It captures project state, environment
specifics, and hard-won lessons from the session that shipped the estimates
module, admin reports, and email integration (roughly v10.5 → v11.2+). The
other `.claude/*.md` docs cover durable architecture/decisions/mistakes —
this doc is the "what's the current state of the world and what did we learn
getting here" log. Update it at the end of any substantial session.

## Current state (as of this writing)

- **Version**: `v11.2` in `src/version.ts` / `package.json` (`11.2.0`)
- **Working branch**: `claude/add-setup-for-all-users-ZsXaT` — reused across this
  entire session (13+ PRs). Check `git branch --show-current` and
  `git log origin/main..HEAD` before assuming it's clean/merged.
- **Latest PR**: #62 ("Fix: invited estimate participants couldn't be seen by
  their own RLS checks") — **check GitHub for merge status before starting new
  work**; it may or may not be merged yet.
- **Pending SQL**: if PR #62 isn't merged/run yet, the migration
  `supabase/migrations/20260709000000_fix_estimate_participants_select.sql`
  still needs to be run in the Supabase SQL editor — it fixes a real bug where
  invited estimate participants (especially contractors) can't post messages.

**First thing to do in a new thread**: run `git log origin/main --oneline -5`
and check open PRs on GitHub to see what's actually landed vs. what's still
pending merge/deploy. This session hit the same trap repeatedly (see
"Deployment gotchas" below) — don't assume the last commit made it live.

## Environment specifics

### Supabase
- Project ref: `bkxccrbfjoqtxbtekrgw` (URL: `https://bkxccrbfjoqtxbtekrgw.supabase.co`)
- **No Supabase CLI is linked/available on the VPS or in this environment.**
  All schema changes go through the **Supabase SQL editor** (dashboard),
  pasted and run manually. Always give the user the full SQL to paste — don't
  assume `supabase db push` is available.
- Edge functions are deployed via the **Supabase dashboard's built-in code
  editor** (Edge Functions → Create/select function → paste code → Deploy).
  No CLI deploy in this workflow either.
- Secrets (Project Settings → Edge Functions → Secrets), already configured:
  `OPENAI_API_KEY`, `INBOUND_EMAIL_SECRET`, `RESEND_API_KEY`,
  `NOTIFICATION_FROM_EMAIL` (`LedgerX <notifications@90ten.life>`), `APP_URL`
  (`https://ledger.90ten.life`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### VPS / hosting
- Hostinger VPS, IP `72.62.174.193`, repo cloned at `/opt/LedgerX`.
- Deploy: `cd /opt/LedgerX && git pull origin main && npm ci && npm run build && sudo rsync -avz --delete dist/ /var/www/ledger.90ten.life/`
- Reverse proxy is **Traefik** (not nginx), SSL via Traefik's built-in ACME.
- Domain `90ten.life` is registered and DNS-hosted at **Hostinger** (hPanel →
  DNS Zone editor) — this is where you add any DNS records (see Resend below).
- Legacy domain `ledger.phillyshah.com` 301-redirects to `ledger.90ten.life`.

### Email — inbound
- `receipts@90ten.life` is a real Hostinger mailbox. A Python script on the
  VPS polls it via IMAP every 5 minutes (cron) and POSTs new mail to the
  `inbound-email` edge function with a shared secret
  (`INBOUND_EMAIL_SECRET` / VPS env `LEDGERX_INBOUND_SECRET`).
- `inbound-email` also now doubles as the entry point for **email commands**
  (see Features below) — an attachment-agnostic check on the whole normalized
  subject line routes `help`/`estimates`/`invoices` to the `email-command`
  function instead of processing as a receipt.
- **Known drift**: the `inbound-email` code actually deployed live (via the
  dashboard editor) is an **older, simpler version** than what's in the repo
  — it has weaker message-ID dedup and no HEIC-content-type filtering that
  the repo's canonical version has. This was discovered mid-session; only the
  command-dispatch block was patched into the *live* (older) version, not the
  full repo version. **Reconciling these two versions is an open item** — see
  Outstanding Items below.

### Email — outbound (Resend)
- Outbound mail (submission notifications, invoice-paid notices, household
  activity nudges, email-command replies) goes through **Resend**
  (`RESEND_API_KEY`).
- The sending domain `90ten.life` had to be **verified in Resend** (DKIM/SPF/MX
  records added via Hostinger's DNS Zone editor) before any outbound mail
  would deliver — it was silently 403'ing before this. This likely means
  **all** prior outbound notifications (invoice/receipt/submission emails)
  were also failing until this was fixed this session.
- **Decision**: verified the **root domain** `90ten.life` (not a subdomain
  like `ledger.90ten.life`) — subdomains cost nothing extra, but the root was
  simpler and avoids a second verification. `NOTIFICATION_FROM_EMAIL` is set
  to `notifications@90ten.life` accordingly — it doesn't need to be a real
  Hostinger mailbox, just an address on the verified domain.
- Hostinger (receiving mail) and Resend (sending mail) are independent —
  verifying the domain in Resend does not touch or move any Hostinger mailbox.

## Features shipped this session (chronological)

| Version | What | Key files |
|---|---|---|
| v10.5–v10.6 | Contractor estimates: submit, per-estimate chat, admin accept/reject; full admins can also submit | `EstimateForm.tsx`, `EstimateList.tsx`, `EstimateChat.tsx`, `admin/AdminEstimates.tsx` |
| v10.7 | Network visibility (anyone sharing a household with the submitter can see estimates, read-only) + billing type field (`total` \| `labor_only`) | `20260703000000_network_estimates_billing_type.sql` |
| v10.8 | Admins can invite arbitrary users as estimate participants (full read/write chat access) | `20260705000000_estimate_participants.sql`, invite UI in `AdminEstimates.tsx` |
| v10.9 | Full i18n pass on estimate chat/invite error messages (UI labels only — see Decisions) | — |
| v11.0 | Non-contractor household members can post in estimate chats (previously read-only); contractors stay read-only unless creator/admin/invited | `20260706000000_household_members_estimate_chat.sql` |
| v11.1 | Estimate Report (Summary + Open & Aging tabs); estimate events added to Activity Report | `20260707000000_estimate_reports.sql`, `admin/EstimateReport.tsx` |
| v11.2 | Email commands (`help`/`estimates`/`invoices` via `receipts@90ten.life`); household activity nudge emails on invoice/estimate submit/accept/reject/paid | `20260708000000_email_commands_and_household_activity.sql`, `functions/email-command/`, `functions/send-household-activity/` |
| (post-v11.2, no version bump — bug fixes) | Fixed estimate submit button disappearing when list non-empty; fixed estimate detail flash-loop; fixed stale `is_work_evidence` generated types; fixed email-command auth (body-secret instead of relying on dashboard JWT toggle); fixed inbound-email command matching (whole subject, attachment-agnostic); **fixed `estimate_participants` missing SELECT policy** (see below) | various, `20260709000000_fix_estimate_participants_select.sql` |

## Decisions made this session (don't re-litigate without cause)

- **Estimate submission**: any authenticated user can submit (not just
  contractors/admins) — RLS opened via `20260704000000_any_user_submit_estimates.sql`.
- **Estimate chat access**: creator, full admins, and invited participants can
  always post. Non-contractor household members (regular users, household
  admins) can post on any estimate in a shared household. **Contractors**
  remain read-only on estimates they didn't submit **unless** explicitly
  invited as a participant or made an admin — this exclusion is intentional
  (contractors are otherwise "outsiders" even within a shared property).
- **Multilingual scope**: UI labels/errors are fully translated (en + pt-BR).
  **Chat message *content* is NOT machine-translated** — explicit user
  decision to keep this simple; people read messages in whatever language
  they were typed.
- **Email command auth**: match the sender's address against
  `user_profiles.real_email` only (via existing `resolve_sender_email` RPC).
  No tokens, no allowlist file — deliberately kept simple per user request.
- **Email commands ship in v1**: `help` (anyone), `estimates` and `invoices`
  (admins + household admins only). Reuses the existing `receipts@90ten.life`
  address rather than a new dedicated inbox — zero new infrastructure.
- **Household activity nudges**: light "something changed, check the app"
  emails only — no amounts, names, or descriptions in the email body (privacy/
  simplicity). Recipients = every household member with a profile email, minus
  the person who took the action, minus contractors who didn't create the
  item themselves (so contractors only hear about their own submissions).

## Deployment gotchas learned this session (read before repeating)

1. **A merged PR can lag behind your latest push.** Multiple times this
   session, a commit was pushed to the working branch *after* its PR had
   already been reviewed/merged, silently leaving that commit unmerged and
   undeployed while everyone assumed it was live. **Always verify with**
   `git log origin/main..HEAD --oneline` **before telling the user "this is
   deployed"** — if it shows commits, rebase (`git rebase origin/main`), push
   with `--force-with-lease`, and open a fresh PR.
2. **Migrations are not self-applying.** The repo having a migration file
   means nothing until it's actually pasted into the Supabase SQL editor and
   run. This bit us at least twice (a stale RLS policy, a stale generated-types
   file). When in doubt, give the user a live query to check the *actual*
   deployed state (`pg_policy`, `information_schema`, etc.) rather than
   assuming the repo and the database agree.
3. **Edge function "Verify JWT" toggle is unreliable/hard to find** in newer
   Supabase dashboard UIs. Don't design a server-to-server call (e.g.
   `inbound-email` → `email-command`) around toggling it. Instead: send the
   **service-role key** as the `Authorization: Bearer` header (satisfies the
   platform's JWT gate unconditionally) and pass your own shared secret in the
   **request body**, verified manually inside the function. Works regardless
   of the function's JWT-verification setting.
4. **A brand-new Resend sending domain will silently 403** every outbound
   email until verified (DKIM/SPF/MX records in the domain's real DNS host —
   here, Hostinger). The Postgres/edge-function code can be 100% correct and
   still produce zero visible emails — always ask "is the from-domain
   verified in Resend?" early when outbound mail isn't arriving.
5. **The subtle RLS bug worth remembering**: a table with RLS enabled but
   **zero policies for a given operation** silently denies that operation to
   any ordinary role — *including when the table is referenced from another
   table's policy via a subquery*, because that subquery runs as the calling
   user's own role, not with elevated privileges. This is invisible if you
   only test via the SQL editor (bypasses RLS) or a `SECURITY DEFINER`
   RPC (also bypasses RLS) — it only shows up on the real client-side action.
   `estimate_participants` was built "no direct client access, RPCs only,"
   which was fine for the RPCs but broke four *other* tables' policies that
   checked participant status via a plain `EXISTS` subquery. Fixed by adding
   a `USING (user_id = auth.uid())` SELECT policy — the minimal grant needed.
   **If a permission bug survives ruling out policy text, session/token
   validity, and the exact client payload, suspect a referenced table's own
   missing RLS coverage next.**
6. **Diagnostic order that actually worked** when a "can't post/save" bug
   defied the obvious RLS read: (1) confirm the live policy text via
   `pg_policy` + `pg_get_expr`, (2) confirm the session token's `sub`/`role`/
   `exp` via decoding it (not just an app-level `getUser()` call), (3) confirm
   the exact client request payload (Network tab, not just the console
   error), (4) check for restrictive or `FOR ALL` (`polcmd = '*'`) policies
   that might be silently ANDing against everything, (5) only then suspect a
   *referenced* table's own RLS as in point 5 above.

## PR reference (this session, chronological)

`#50` contractor estimates base → `#51` v10.6 admin-submit → `#52` v10.7
network+billing → `#53` flash-loop fix → `#54` v10.8 participants → `#55`
submit-button fix + v10.9 i18n/type cleanup → `#56` (merged same content as
#55, see note above about drift) → `#57` v11.0 household chat + stale-types
fix → `#58` v11.1 reports → `#59`/`#60`/`#61` email-command auth/matching
fixes → `#62` estimate_participants SELECT-policy fix (root-caused the
chat-posting bug).

## Migrations, in order (all in `supabase/migrations/`)

```
20260701000000_add_estimates.sql
20260702000000_admins_submit_estimates.sql
20260703000000_network_estimates_billing_type.sql
20260704000000_any_user_submit_estimates.sql
20260705000000_estimate_participants.sql
20260706000000_household_members_estimate_chat.sql
20260707000000_estimate_reports.sql
20260708000000_email_commands_and_household_activity.sql
20260709000000_fix_estimate_participants_select.sql   <- confirm this has been run
```

## Outstanding / open items for a future thread

1. **Reconcile `inbound-email`** — the deployed dashboard version has drifted
   from the repo's canonical version (weaker dedup, no HEIC filter). Should
   be brought back in sync, carefully, without losing the command-dispatch
   patch that was added directly to the deployed (older) version.
2. **`ashesh.shah@gmail.com` is registered as Andy's `real_email`** — surfaced
   during email-command testing. Confirm this mapping is intentional; if not,
   it means commands/replies from that address report Andy's data, not the
   sender's own.
3. **Contractor/participant permission parity** — user asked whether
   `testcontract` should get the same access as `wandy` (who's an invited
   participant). Two options were laid out (per-estimate invite vs. a
   systemic rule letting any contractor in a shared household post) and the
   question was dismissed without a decision. Revisit if it comes up again.
4. **`.claude/ARCHITECTURE.md` is stale** (references `v4.3`, predates
   contractors/invoices/estimates/household-admin/reports entirely). Not
   touched this session — worth a refresh pass at some point so it's useful
   again, but out of scope for quick fixes.

## How to resume work in a new thread

1. Read `CLAUDE.md` (auto-loaded) and this file.
2. `git fetch origin main && git log origin/main --oneline -10` — see what's
   actually merged.
3. Check GitHub for open PRs against `phillyshah/ledgerx` — don't assume the
   last PR mentioned here is still accurate.
4. Confirm the live app version by visiting `https://ledger.90ten.life` and
   checking the version footer, or `src/version.ts` on `main`.
5. Continue on branch `claude/add-setup-for-all-users-ZsXaT` unless told
   otherwise, following the version-bump / i18n / README / release-notes
   rules in `CLAUDE.md`.

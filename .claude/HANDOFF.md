# Session Handoff

**Read first.** Current state + hard-won environment/deploy lessons. The other
`.claude/*.md` docs cover durable architecture. Update this at the end of any
substantial session.

## Current state

- **Version `v13.2`** in repo/branch (`src/version.ts` / `package.json`). CLAUDE.md's
  "v7.8" is stale. **Live site** trails until each deploy lands (see below).
- **⚠️ Pending manual steps for v13.2 (manual edit of statement line items)**:
  1. SQL editor: run **`20260727000000_admin_edit_statement_line_item.sql`**
     (idempotent; tested against a full migration replay on local Postgres 16 —
     scaffold + all `…722` through `…727` migrations, covering non-admin reject,
     household-admin reject, full-admin edit, blank-description no-op, negative-
     amount reject, missing-row reject, and editing a matched item without
     disturbing the match). Adds `admin_update_statement_line_item(p_line_item_id,
     p_line_date, p_description, p_amount)` RPC.
  2. **No edge function, no new secrets.** VPS rsync for the frontend.
  3. Full-admin only (matches the existing statement-management convention —
     upload/rename/delete are all full-admin-only; household admins can view/
     match but not edit the raw OCR'd fields). Reason for the feature: OCR on
     card statements is sometimes wrong (misread digits, garbled names) — this
     was the exact fix for the Lowe's `2023` vs `2026` year-misread the user hit
     testing v12.3. Tap **Edit** on any line item (matched or unmatched) in
     `StatementReconcile.tsx` to fix date/description/amount inline.
  4. **Separately unstarted**: a plan exists (from an earlier plan-mode session,
     not yet approved) to fix the *root cause* of that same year-misread bug —
     widen `statementMatching.ts`'s date-exclusion window 5→7 days, add a
     deterministic `statementDateRepair.ts` pass keyed off the statement's
     billing period, thread period hints into `extract-statement`'s OCR prompt,
     and stop `extract-receipt`'s `repairImplausibleYear` from "fixing" *past*
     dates (only future dates should ever be auto-corrected). This session's
     manual-edit feature is the stopgap the user asked for instead; the
     deeper fix is still worth doing but needs the user's go-ahead first.
- **⚠️ Pending manual steps for v13.1 (CC reconciliation comments + report)**:
  1. SQL editor: run **`20260726000000_labs_reconciliation_comments_and_report.sql`**
     (idempotent; tested locally). Adds `statement_line_item_comments` table +
     RLS, `list_line_item_comments` / `reconciliation_mentionable` /
     `reconciliation_mention_recipients` / `list_reconciliation_report` RPCs, a
     comment→notification trigger, and ALTERs the `notifications` kind +
     entity_type CHECKs (adds `reconcile_mention` / `statement_line_item`).
  2. Dashboard: create the **`send-reconcile-mention`** edge function (paste from
     repo; Verify JWT ON, reuses `RESEND_API_KEY` / `APP_URL` / `NOTIFICATION_FROM_EMAIL`
     — no new secrets). Bell + WhatsApp are automatic via the DB trigger; this
     is email only.
  3. VPS rsync for the frontend.
  4. Comments/report are super-admin + household-admin (report is full-admin only);
     no per-household config beyond the existing Labs flag.
- **⚠️ Pending manual steps for v13.0 (household-admin candidate creator scope)**:
  1. SQL editor: run **`20260725000000_labs_candidate_creator_scope.sql`**
     (idempotent; tested locally). CREATE OR REPLACEs `list_reconciliation_candidates()`
     + `can_act_on_expense()` to hide receipts submitted by OTHER household admins or
     full admins from a household admin's candidate list (they still see own + regular
     users + contractors). Full admins unchanged. **SQL-only — no frontend change**, but
     rsync the v13.0 build for the version bump.
  2. No What's New entry (access-scoping refinement, nothing to announce — same call as v12.6).
- **⚠️ Pending manual steps for v12.9 (cross-household reconciliation candidates)**:
  1. SQL editor: run **`20260724000000_labs_reconciliation_cross_household.sql`**
     (idempotent; tested locally). Adds `list_reconciliation_candidates()` RPC +
     loosens `can_act_on_expense()` so any Labs-eligible admin can match across
     all Labs-flagged properties.
  2. **Turn ON the Labs flag for every property whose receipts should be
     matchable** (Admin → Manage Households → <house> → Features). A property's
     expenses only appear as candidates once it's enrolled. This is the actual
     cause of the "$806.26 HomeAve receipt missing" report — the reconciler was
     a household admin, and HomeAve wasn't in their flagged set / wasn't flagged.
  3. VPS rsync for the frontend.
- **v12.8 (amount-only matching)** and **v12.7 (pool fix + browse)** merged +
  presumed deployed; footer confirmed v12.8 live during testing.
- **Branch**: `claude/add-setup-for-all-users-ZsXaT` (rolling; reused every session).
  Before starting: `git fetch origin main && git log origin/main..HEAD` — if empty,
  `git checkout -B <branch> origin/main` to start fresh on top of merged work.
  **The remote branch auto-deletes when its PR merges** — see deploy gotcha #6.
- **v12.3–v12.5 (LedgerX Labs + OCR year-misread fix + rename/badge)**: fully
  deployed and user-confirmed working (PRs #73/#74/#75 merged).
- **v12.6 (Labs access restricted to admins/household-admins)**: PR #76 merged;
  migration `…723` must be run in SQL editor if not yet done.
- **⚠️ Pending manual steps for v12.7 (CC Reconciliation matching fix + browse-all)**:
  1. VPS rsync for the frontend. **No migration, no edge function, no secrets** —
     pure frontend (new `useReconciliationCandidates` hook + reconcile-screen UI).
  2. Root cause of the reported "obvious match not detected" bug: the candidate
     pool came from `useExpenses()`, which is scoped to households the RECONCILING
     user is personally a member of — so a full admin reconciling a statement that
     covers a household they don't belong to never saw those expenses. Fix loads
     the pool per-role (full admin → all expenses via RLS's `is_admin()` bypass;
     household admin → their flagged households). Also added a searchable "browse
     all receipts" fallback in the right pane, and rounded the match score to fix
     a float-dust issue where an exact amount+date pair scored 0.8999… and missed
     the 0.9 auto-match threshold.
- **⚠️ Pending manual steps for v12.2 (WhatsApp)** — full checklist in the deploy
  instructions message; summary:
  1. SQL editor: run **`20260717000000_whatsapp_integration.sql`** (idempotent).
  2. Dashboard: create **`whatsapp-inbound`** + **`whatsapp-send`** edge functions
     (paste from repo; **Verify JWT OFF** for both — config.toml has the entries).
  3. Re-paste the 4 patched send fns: `send-submission-notification`,
     `send-invoice-notification`, `send-mention-notification`,
     `send-household-activity` (channel gating; **diff live vs repo first**).
  4. Edge secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
     `TWILIO_WHATSAPP_FROM`, `TWILIO_WEBHOOK_URL` (+ later `TWILIO_TEMPLATE_SID`).
  5. Twilio: sandbox join + webhook URL → whatsapp-inbound.
  6. VPS rsync for the frontend.
- **v12.1 (`…716`)**: user confirmed merged; SQL run on live not yet explicitly
  confirmed — verify before relying on payment_method/delete_notifications.
- **Verified live earlier (v12.0)**: `…715 chat_mentions.sql` ran + `send-mention-notification`
  edge fn deployed (user confirmed). v11.9 `…714` re-run + v11.8 `…712` assumed applied.

## Environment (no CLI — everything manual via dashboard)

- **Supabase** project ref `bkxccrbfjoqtxbtekrgw`. **No CLI linked.** Schema changes:
  paste full SQL into the **SQL editor**. Edge functions: paste into the dashboard
  **Edge Functions** editor → Deploy. Always hand the user the full SQL/code.
- **Deploy frontend** (Hostinger VPS `72.62.174.193`, repo at `/opt/LedgerX`, Traefik):
  `cd /opt/LedgerX && git pull origin main && npm ci && npm run build && sudo rsync -avz --delete dist/ /var/www/ledger.90ten.life/`
  Prod: `https://ledger.90ten.life` (old `ledger.phillyshah.com` 301s to it).
- **Email**: `receipts@90ten.life` (Hostinger mailbox) → VPS IMAP cron → `inbound-email`
  edge fn (shared `INBOUND_EMAIL_SECRET`); forwards command subjects (`help`/`estimates`/
  `invoices`/`pending`/`todo`/`activity`) to `email-command`. Outbound via **Resend**
  (`RESEND_API_KEY`); domain `90ten.life` DKIM/SPF/MX-verified in Resend.
- **WhatsApp (v12.2)**: Twilio. Inbound: Twilio webhook → `whatsapp-inbound`
  (X-Twilio-Signature over the **pinned `TWILIO_WEBHOOK_URL`**, never req.url).
  Outbound: `notifications` INSERT trigger → `whatsapp_outbox` → pg_cron
  (`ledgerx-whatsapp-outbox-drain`, every minute, X-Cron-Secret) → `whatsapp-send`
  → Twilio REST. Free-form only within 24h of the user's last inbound
  (`user_phone_numbers.last_inbound_at`, 23h margin); else `TWILIO_TEMPLATE_SID`
  content template; else row marked `skipped`. Phone→user allow-list =
  `user_phone_numbers` (admin-managed, globally unique E.164).
- Edge secrets set: `OPENAI_API_KEY`, `INBOUND_EMAIL_SECRET`, `RESEND_API_KEY`,
  `NOTIFICATION_FROM_EMAIL`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CRON_SECRET`. **New for v12.2**: the four `TWILIO_*` secrets above.

## Features shipped (recent sessions, v11.5–v12.6)

| Ver | What | Key files |
|---|---|---|
| v11.5 | **Notifications bell** (chat / estimate+invoice created / status / paid) | `…710 notifications.sql`, `useNotifications.ts`, `NotificationBell.tsx` |
| v11.7 | **Notification deep-linking** (`openId`/`onOpenHandled`; `CollapsibleSection.expandSignal`) | `NotificationBell.tsx`, `Dashboard.tsx`, the 4 lists |
| v11.8 | **Email commands `pending` + `activity`** (read-only, admin/HA; `todo`=alias) | `…712`, `email-command`, `inbound-email` |
| v11.9 | **Add photos to existing invoice/estimate** + document image compression | `…714`, `AttachmentAdder.tsx`, `imageCompression.ts` |
| v12.0 | **@mention chat → email + `chat_mention` bell**, deep-linked | `…715`, `send-mention-notification`, `EstimateChat.tsx`, `useInitialDeepLink.ts` |
| v12.1 | **Admin edits invoice/estimate fields**; **payment method on mark-paid**; **delete notifications** | `…716`, `AdminInvoices.tsx`, `AdminEstimates.tsx`, `NotificationBell.tsx` |
| v12.2 | **WhatsApp**: text the bot to create expense/invoice/estimate (NL via OpenAI, YES-confirm), add photos to existing, keyword reports; **notifications to WhatsApp** per user channel pref (email/whatsapp/both); admin phone mgmt | `…717 whatsapp_integration.sql`, `whatsapp-inbound`, `whatsapp-send`, 4 patched send-*, `useWhatsApp.ts`, `ManageUsers.tsx`, `UserSettings.tsx` |
| v12.3 | **LedgerX Labs** (new experimental-features area) + first experiment **Credit Card Reconciliation**: admin uploads a statement (CSV, or PDF/photo OCR'd via a new edge fn), members match line items to their own receipts (client-side scoring, bulk auto-match, reverse "Match to card statement" entry point on the expense list) | `…722 labs_cc_statement_reconciliation.sql`, `extract-statement`, `src/components/labs/*`, `statementMatching.ts`, `statementCsv.ts`, `statementScanner.ts`, `useLabsAccess.ts` |
| v12.4 | **Fix**: statement OCR year-misread (no digit-repair, unlike receipt OCR) broke matching; added period-based repair + loosened `extract-receipt`'s over-aggressive year "fix" | `statementDateRepair.ts`, `extract-statement`, `extract-receipt` |
| v12.5 | Rename an uploaded statement (admin); small "Matched" badge on matched transactions; announced the whole Labs CC feature via What's New (skipped at v12.3 launch) | `StatementList.tsx`, `useMatchedCardLabels.ts`, `releaseNotes.ts` |
| v12.6 | **Restricted Labs access to full admins + household admins only** (was: any non-contractor member) — RLS + `can_act_on_expense()` + `useLabsAccess.ts` all tightened; dead Labs UI removed from `Dashboard.tsx` | `…723 labs_household_admin_only.sql`, `useLabsAccess.ts`, `Dashboard.tsx` |

## Decisions (don't re-litigate)

- **WhatsApp (v12.2)**: **Twilio** (user's pick; sandbox now, production sender +
  approved UTILITY template later). **Natural language** parsing (gpt-4o-mini,
  temp 0, JSON-only) but **code is the authority** — every field re-validated,
  households matched code-side against the user's memberships, required-field
  sets enforced in code, and **nothing is written until the user replies YES**
  (atomic session-state claim kills double-YES). Phone linking is **admin-only**
  (`user_phone_numbers`, globally-unique E.164 — deliberate divergence from the
  owner-managed `user_sender_emails`). Unknown numbers get ONE generic bilingual
  decline (no info leak). Bot = service role ⇒ **re-implements permission checks
  in code** (mirrors RLS: invoice needs contractor/HA/admin + household member;
  estimate needs ≥1 attachment; add_photos mirrors v11.9 visibility). Media
  staged under `whatsapp-staging/<digits>/` (invisible to users — not a household
  uuid) and **moved into the household folder only on YES**. Notifications ride
  the existing `notifications` triggers via an outbox (retry/backoff/lease) —
  chose outbox+cron over trigger-direct pg_net (no retries) and over per-sender
  Twilio calls (N call sites). **Channel pref gates each email sender**, EXCEPT
  expense-related emails which ignore the pref (no bell/WhatsApp equivalent —
  they'd black-hole). `send-inactivity-reminder` stays email-only.
- **Notifications**: chat + estimate/invoice created + status changes (not receipts).
  Recipients mirror `household_activity_recipients` (never actor; contractors only
  hear about own items; creator hears outcomes).
- **@mentions (v12.0)**: plain `@text`; email actor = JWT caller, never body.
- **Admin edits + payment method + notif delete (v12.1)**: full-admin only RPCs;
  estimates have no amount; `delete_notifications` only touches the caller's bell.
- **i18n**: all UI labels/aria in en+pt-BR; chat *message content* is NOT translated.
- **Email-command auth** = `resolve_sender_email` over `user_sender_emails`;
  unknown senders silently dropped; RPCs take explicit `p_user_id` (service role).
- **LedgerX Labs / CC Reconciliation — current state (v12.3–v12.6), condensed:**
  first use of `features_enabled` with an actual visual identity (violet accent,
  `LabsBadge`) instead of a silent `if (!flag) return null`. Per-experiment flags
  (`labs_*` prefix, e.g. `labs_cc_reconciliation`), no umbrella `labs` column.
  **Access is full-admin + household-admin only** (v12.6 correction — originally
  shipped as "any non-contractor member," tightened on request); enforced at
  *both* layers: `useLabsAccess.ts` gates the UI on `isAdmin || isHouseholdAdmin`,
  and — the layer that actually matters — RLS SELECT policies + the
  `can_act_on_expense()` SECURITY DEFINER function (the sole gate behind all 3
  matching RPCs) independently require the same role, so a direct RPC call
  can't bypass a hidden button. **Statements are admin-only and NOT
  household-scoped** (one card can cover multiple properties) —
  `credit_card_statements` carries no `household_id`. Matching/unmatching is
  **RPC-only** (`match_statement_line_item` / `unmatch_statement_line_item` /
  `bulk_match_statement_line_items`), never a client UPDATE, since "can this
  caller touch the target *expense*" isn't a clean RLS predicate on
  `statement_line_items` alone. Matching scoring (`statementMatching.ts`) is
  **client-side, no AI call** (amount dominant + date decay + vendor
  text-overlap tiebreaker). OCR (`extract-statement`) uses `detail:"high"`
  (unlike the "low" on receipt/invoice OCR — statements are dense, misreads
  costly) capped at 10 pages, and cross-checks extracted line-item years
  against the uploader-entered statement period (`statementDateRepair.ts`) to
  catch digit misreads — `extract-receipt`'s separate year-repair heuristic was
  also loosened to never "fix" a merely-old past date, only an impossible
  future one. No global "What's New" entry at v12.3 launch (household-gated,
  felt out of place in a global changelog); added retroactively at v12.5 once
  that felt wrong. v12.6 (this restriction) intentionally has **no** What's New
  entry — pure access-control correction, nothing new to announce.

## Deploy gotchas (learned the hard way)

1. **PR can lag your last push.** Always `git log origin/main..HEAD` before saying
   "deployed"; check the PR head SHA.
2. **Migrations don't self-apply** — a repo file means nothing until run in the SQL
   editor. When unsure of live state, give the user a `pg_policy`/`information_schema` query.
3. **Edge server-to-server auth**: for bot-to-bot, service-role key as Bearer + a
   shared secret (or explicit actor_id) in the body; for frontend-invoked functions,
   derive the actor from the caller's JWT. **Twilio webhooks**: validate
   X-Twilio-Signature against the **pinned public URL secret** — req.url is rewritten
   by the platform proxy and will never match.
4. **New Resend domain silently 403s** until DKIM/SPF/MX verified.
5. **RLS-referenced-table trap**: a table with RLS on but no policy for an op silently
   denies it — including inside another policy's EXISTS. Service role bypasses RLS
   entirely ⇒ every bot write needs code-side permission re-checks.
6. **Remote branch auto-deletes on PR merge** → `git remote prune origin` then plain
   `git push -u`. **Verify origin/main actually contains your review-fix commits after
   a merge** (the #68/#69 merges landed early commits only).
7. **email-command = 3 pieces**: SQL RPCs + `email-command` + a `KNOWN_COMMANDS` line
   in the LIVE `inbound-email` (don't wholesale-paste inbound-email — live copy drifted).
8. **WhatsApp sandbox limits**: participants re-join every 72h; business-initiated
   messages outside the 24h window are impossible without an approved template ⇒
   outbox rows go `skipped` (visible in `whatsapp_outbox` under admin SELECT).
   jsr.io is blocked in the cloud dev container — `deno check` needs an import map
   stubbing `jsr:@supabase/functions-js/edge-runtime.d.ts` (npm registry works).
9. **`ALTER DATABASE postgres SET app.* = ...` fails on hosted Supabase** — the
   SQL-editor role isn't the DB owner, so this 403s with `permission denied to
   set parameter`. This blocked BOTH the v12.2 WhatsApp cron and the older
   inactivity-reminder cron (neither GUC was ever actually set on this
   project). **Fix**: use a plain session-level `SET` (no special privileges
   needed for custom `class.name` GUCs) immediately followed by the
   `cron.schedule(...)` DO block, **in the same SQL-editor "Run"** — the cron
   job bakes the literal URL/secret into its stored command text via
   `format(...,%L,...)`, so the GUC only needs to exist for that one script
   execution, not persistently. Confirmed working on this project 2026-07-07.

## Migrations (in `supabase/migrations/`, chronological tail)

`…712 email_pending_activity` · `…714 attachment_inserts` ·
`…715 chat_mentions` (v12.0, applied) ·
**`…716 admin_edit_and_payment_method` ← confirm applied (v12.1)** ·
**`…717 whatsapp_integration` ← RUN THIS (v12.2)** ·
`…722 labs_cc_statement_reconciliation` (v12.3, applied) ·
**`…723 labs_household_admin_only` ← RUN THIS (v12.6)**

## Open items

1. **v12.2 manual deploy** (top of file). After SQL: verify cron exists —
   `SELECT jobname FROM cron.job WHERE jobname = 'ledgerx-whatsapp-outbox-drain';`
2. **Production WhatsApp sender**: register via Twilio (Meta business verification),
   create UTILITY template `LedgerX: {{1}}` → approval → set `TWILIO_TEMPLATE_SID`,
   update `TWILIO_WHATSAPP_FROM` + webhook + `TWILIO_WEBHOOK_URL`.
3. **`inbound-email` drift** — live (dashboard) copy predates the repo. Only
   `KNOWN_COMMANDS` was patched live. Consider syncing.
4. **v12.2 known minors**: bot leaves image width/height null (app tolerates);
   invoice `category_id` not set by bot (admin reassigns later — same as email
   inbox); expense-related emails ignore the channel pref (documented, by design);
   sandbox notifications outside the 24h window are `skipped` until a template exists.
5. **`ashesh.shah@gmail.com` = Andy's sender email?** — confirm intentional.
6. **`.claude/ARCHITECTURE.md` stale** (predates contractors/invoices/estimates/
   notifications/email-commands/mentions/WhatsApp).

## Resume checklist

1. Read CLAUDE.md (auto) + this file.
2. `git fetch origin main && git log origin/main --oneline -8`; check open PRs.
3. Confirm live version at `https://ledger.90ten.life` footer.
4. Work on branch `claude/add-setup-for-all-users-ZsXaT`; follow version-bump /
   i18n(en+pt-BR) / README×2 / releaseNotes+emoji rules in CLAUDE.md; push via PR.

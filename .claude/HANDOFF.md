# Session Handoff

**Read first.** Current state + hard-won environment/deploy lessons. The other
`.claude/*.md` docs cover durable architecture. Update this at the end of any
substantial session.

## Current state

- **Version `v12.0`** in repo/branch (`src/version.ts` / `package.json`). CLAUDE.md's
  "v7.8" is stale. **Live site** trails until each deploy lands (see below).
- **Branch**: `claude/add-setup-for-all-users-ZsXaT` (rolling; reused every session).
  Before starting: `git fetch origin main && git log origin/main..HEAD` — if empty,
  `git checkout -B <branch> origin/main` to start fresh on top of merged work.
  **The remote branch auto-deletes when its PR merges** — see deploy gotcha #6.
- **⚠️ Pending manual steps** (idempotent SQL — paste in the **Supabase SQL editor**;
  edge functions — paste in **Edge Functions → Deploy**):
  - **`20260715000000_chat_mentions.sql`** (v12.0) — `extract_mentions` /
    `estimate_audience` helpers, the rewritten `notify_estimate_message` trigger
    (adds the `chat_mention` notification kind), and `estimate_mention_recipients`.
    Without it @mentions produce no email and no "mentioned you" bell entry.
  - **Deploy the new `send-mention-notification` edge function** (v12.0). Without it
    the mention-email invoke fails silently — best-effort, never blocks the chat post.
  - **`20260714000000_attachment_inserts.sql`** (v11.9) — confirm applied (the file
    IS in main via #68, but the v11.9 review-fix/handoff commits were NOT — see #6).
  - **`20260712000000_email_pending_activity.sql`** (v11.8) — confirm applied.
  - `20260710000000_notifications.sql` (v11.5) should already be applied (bell works).

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
- Edge secrets set: `OPENAI_API_KEY`, `INBOUND_EMAIL_SECRET`, `RESEND_API_KEY`,
  `NOTIFICATION_FROM_EMAIL`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Features shipped (recent sessions, v11.3–v12.0)

| Ver | What | Key files |
|---|---|---|
| v11.3 | Simpler home; Insights collapsed; What's New → footer link; bell removed | `Dashboard.tsx`, `AppFooter.tsx` |
| v11.4 | Household admins can submit estimates (UI-only; RLS already allowed) | `admin/AdminLayout.tsx` |
| v11.5 | **Notifications bell** (chat / estimate+invoice created / status / paid) | `…710 notifications.sql`, `useNotifications.ts`, `NotificationBell.tsx` |
| v11.6 | Logo = **Home button** on every screen | `Dashboard.tsx`, `admin/AdminLayout.tsx` |
| v11.7 | **Notification deep-linking** — tap a bell row → opens that estimate/invoice (`openId`/`onOpenHandled` threaded into lists; `CollapsibleSection.expandSignal`) | `NotificationBell.tsx`, `Dashboard.tsx`, `admin/AdminLayout.tsx`, the 4 lists |
| v11.8 | **Email commands `pending` + `activity`** (read-only, admin/HA; `todo`=alias) | `…712 email_pending_activity.sql`, `email-command`, `inbound-email` |
| v11.9 | **Add photos to existing invoice/estimate** (anyone who can view) + document image compression | `…714 attachment_inserts.sql`, `AttachmentAdder.tsx`, `imageCompression.ts` |
| v12.0 | **@mention in estimate chat → email + distinct "mentioned you" bell entry**, deep-linked from the email; @mentions highlighted in bubbles | `…715 chat_mentions.sql`, `send-mention-notification`, `EstimateChat.tsx`, `useInitialDeepLink.ts` |

## Decisions (don't re-litigate)

- **Notifications**: chat + estimate/invoice created + status changes (not receipts).
  Recipients mirror `household_activity_recipients` (never actor; contractors only
  hear about own items; creator hears outcomes). **Deep-linking DONE (v11.7).**
- **@mentions (v12.0)**: **plain `@text`** (no autocomplete picker) — parsed on send,
  matched against the estimate's audience; a typed name outside the audience is
  ignored (no email, no leak). **Email + a distinct `chat_mention` bell kind** (the
  mentioned member gets `chat_mention`, NOT the generic `chat_message` — never both;
  sender gets neither). The email actor is the **authenticated caller (from the JWT)**,
  never a body-supplied `actor_id` — a review found the body-trust version let any
  member send impersonated mention emails. Mentionable set = the estimate's audience
  (creator ∪ participants ∪ non-contractor household members ∪ prior posters).
- **Add-photos audience (v11.9)** = anyone who can *view* the record (invoices: creator
  + admins + household admins; estimates: creator + admins + household members +
  participants). Enforced by RLS mirroring each table's SELECT. Non-owner adds target
  the child table only (`invoice_images`/`estimate_attachments`), never the legacy column.
- **Image compression presets** (`src/lib/imageCompression.ts`): documents =
  `compressToDocumentJpeg` 1600px / q0.8 / ~0.6MB (every create+attach flow);
  work-evidence = `compressToMediumJpeg` 1280 / 0.75; OCR copies = `…,0.3,800,800`.
  **PDFs pass through untouched** (rasterized only for OCR, never for storage).
- **i18n**: all UI labels/aria in en+pt-BR; chat *message content* is NOT translated.
- **Email-command auth** = sender resolved via `resolve_sender_email` against the
  `user_sender_emails` allow-list (NOT `user_profiles.real_email` directly). Unknown
  senders silently dropped. Command RPCs are `SECURITY DEFINER`, take explicit
  `p_user_id` (bot runs as service role, `auth.uid()` is null), granted to `service_role`.

## Deploy gotchas (learned the hard way)

1. **PR can lag your last push.** Always `git log origin/main..HEAD` before saying
   "deployed"; check the PR head SHA.
2. **Migrations don't self-apply** — a repo file means nothing until run in the SQL
   editor. When unsure of live state, give the user a `pg_policy`/`information_schema` query.
3. **Edge server-to-server auth**: don't rely on the dashboard "Verify JWT" toggle.
   For bot-to-bot, send service-role key as `Authorization: Bearer` + a shared secret
   in the body (inbound-email → email-command). For frontend-invoked functions that
   act on behalf of a user, **derive the actor from the caller's JWT** (`auth.getUser`),
   never from the request body — trusting a body `actor_id` is a spoofing hole (v12.0).
4. **New Resend domain silently 403s** until DKIM/SPF/MX verified.
5. **RLS-referenced-table trap**: a table with RLS on but *no policy for an op* silently
   denies it — including inside another table's policy `EXISTS` subquery. Inverse also
   bites: an INSERT policy can be *broader* than SELECT — mirror SELECT visibility (v11.9).
6. **Remote branch auto-deletes on PR merge** → next push `--force-with-lease` fails
   "stale info"; fix with `git remote prune origin` then plain `git push -u`. **Also:
   the #68 merge landed only the feature commit (`d6e3137`) — the later review-fix and
   handoff commits did NOT reach main** (main shipped a broken typecheck + a v11.6-era
   handoff). **Always verify origin/main actually contains your review-fix commits after
   a merge**, and re-run `tsc`/`build` against the reset branch before new work.
7. **email-command = 3 pieces**: SQL RPCs + paste the `email-command` function + a
   one-line `KNOWN_COMMANDS` edit in the LIVE `inbound-email` (don't wholesale-paste
   inbound-email — the live copy is older than the repo).

## Migrations (in `supabase/migrations/`, chronological tail)

`…709 fix_estimate_participants_select` · `…710 notifications` ·
**`…712 email_pending_activity` ← confirm applied** ·
**`…714 attachment_inserts` ← confirm applied** ·
**`…715 chat_mentions` ← confirm applied (v12.0)**

## Open items

1. **Apply `…715`** + **deploy `send-mention-notification`** (see pending steps up top);
   confirm `…712`/`…714` applied.
2. **`inbound-email` drift** — the LIVE (dashboard) copy predates the repo (weaker dedup,
   no HEIC filter). Only the `KNOWN_COMMANDS` line was patched live. Consider syncing
   the live copy back into the repo to stop the drift.
3. **v12.0 known minors**: an `@word` that looks like a username but sits in an email
   address (`bob@gmail.com`) gets a cosmetic bubble highlight — harmless, and no email
   fires unless it matches a real audience username. A thread member can still re-trigger
   mention emails at other members by posting more messages (no rate limit) — expected.
4. **v11.9 known minors**: a network/participant estimate viewer not in the household sees
   "Add photos" but the storage upload errors (membership-scoped) → clean toast;
   deleted-household records write a cosmetic `null/` folder for admins.
5. **`ashesh.shah@gmail.com` = Andy's sender email?** — confirm intentional.
6. **`.claude/ARCHITECTURE.md` stale** (predates contractors/invoices/estimates/reports/
   notifications/email-commands/mentions).

## Resume checklist

1. Read CLAUDE.md (auto) + this file.
2. `git fetch origin main && git log origin/main --oneline -8`; check open PRs.
3. Confirm live version at `https://ledger.90ten.life` footer.
4. Work on branch `claude/add-setup-for-all-users-ZsXaT`; follow version-bump /
   i18n(en+pt-BR) / README×2 / releaseNotes+emoji rules in CLAUDE.md; push via PR.

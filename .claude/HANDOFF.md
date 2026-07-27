# Session Handoff

**Read first.** Current state + hard-won environment/deploy lessons. The other
`.claude/*.md` docs cover durable architecture. Update this at the end of any
substantial session.

## Current state

- **Version `v13.15`** in repo/branch (`src/version.ts` / `package.json`). CLAUDE.md's
  "v7.8" is stale. **Live site** trails until each deploy lands (see below).
- **✅ v13.10 (PR #90), v13.11 (PR #91), v13.12 (PR #92), v13.13 (PR #93), and
  the requirements.txt follow-up (PR #95) are ALL MERGED and confirmed
  deployed** — poller script + deps copied to `/opt/ledgerx/`, and the v13.10
  Activity Report self-inclusion SQL confirmed live via
  `SELECT count(*) FROM pg_proc WHERE proname = 'list_team_activity' AND
  prosrc LIKE '%au.id = auth.uid()%';` returning `1`. **v13.14 (transaction-list
  filter/sort rework, PR #96) and its optimization follow-up (PR #97) are also
  merged, and still need a frontend rebuild. v13.15 (tax features, this
  session) needs SQL + a rebuild — see below.**
- **v13.15 in one paragraph (THIS SESSION — needs SQL + rebuild)**: two tax
  features, specced in `.claude/SPEC-tax-features.md` and built together.
  (1) **Schedule E classification.** Two dedicated tables — `schedule_e_lines`
  (seeded with the 15 IRS lines, fully editable: rename/reorder/hide/add) and
  `category_schedule_e_map` (category_id -> line_id). **`categories` is left
  completely untouched** — an early draft hung an enum column off it, which
  conflated the operational categories contractors pick with the tax lines
  they roll up to, and made the line list unchangeable without a migration.
  Map each category once on the new Mapping tab; every expense then
  classifies itself. Uncategorized expenses fall back through
  the existing `vendor_category_map` (vendor -> category -> line), so the
  auto-categorization the owner asked about is real and deterministic — no
  AI. A `capital_treatment` column on both `expenses` and
  `contractor_invoices` records repair-vs-improvement, surfaced through a
  review queue that only shows items at/above the de minimis threshold and
  pre-fills a *suggestion* (never auto-applies — the BRA test is a legal
  judgment). (2) **1099-NEC readiness.** Zero setup and zero contractor
  storage — see the follow-up note below. Computed purely from
  `contractor_invoices`; payment method decides reportability: card excluded
  (processor files a 1099-K), Zelle/check/ACH reportable, Venmo flagged
  ambiguous, null method reportable-but-warned. Corporations are exempt in
  law but the app never asks who's incorporated, so it **lists everyone over
  the threshold** and the accountant strikes the corporations. Output is a
  downloadable W-9 worksheet. Thresholds live in
  a `tax_settings` singleton, not code — the 1099 figure went $600 -> $2,000
  for payments after 2025-12-31 and is now inflation-indexed. Both features
  are **full-admin only**: `AdminLayout` gates on `isAdmin` and every RPC
  re-checks `is_admin()`. A leak was caught during the build — the nav item
  initially landed in `haNavItems` (household-admin) as well; removed.
  UI is one `TaxCenter` modal with four tabs sharing a tax-year selector
  (`src/components/admin/tax/`) — Schedule E, Capital review, 1099-NEC, and
  Mapping. **It is NOT in the main nav**: per the owner, it lives under a
  restored admin-only **Labs** nav group (the Labs *screen* was deleted in
  v13.5; this is a collapsible nav group mirroring "Manage", with the same
  violet Labs badge Auto Reconcile uses). Plus a passive year-round "$X YTD · 1099 likely" badge in
  `ManageUsers` (informational only). `ManageCategories` is byte-identical to
  main: all tax concerns live inside the Tax Center. **One real correctness fix worth remembering**:
  `contractor_invoices.paid_at` is `timestamptz`, so a naive
  `extract(year ...)` resolves in UTC and pushes an invoice settled at 8pm ET
  on Dec 31 into the next tax year — exactly when year-end settling
  clusters. `tax_year_of()` anchors it to America/New_York; change that one
  constant if the LLC's tax home moves. Verified: **68 SQL assertions** on
  local Postgres 16 (`supabase/tests/`, incl. the timezone boundary,
  config-driven thresholds, the absence of the whole profile apparatus, and
  all 12 RPCs refusing a non-admin), **28 unit assertions** on the
  suggestion/pivot logic, and **120 browser assertions** across desktop +
  mobile including the worksheet CSV contents. Migration re-run is idempotent
  and preserves data.
- **⚠️ Pending manual steps for v13.15**:
  1. **SQL** — run `supabase/migrations/20260802000000_tax_schedule_e_and_1099.sql`
     in the Supabase SQL editor. Safe to re-run, and safe to run *over* the
     earlier draft: it drops the `tax-docs` bucket, its objects, its policies,
     the `w9_doc_path`/address columns, and the old 12-arg upsert overload.
     No storage bucket is created.
  1a. **The 15 Schedule E lines are seeded with the owner's own wording**,
     supplied directly: official line numbers 5-19, labels like
     "Auto & Travel" / "Legal & Professional Fees" (not generic IRS phrasing),
     and a one-line description each. A re-run backfills line numbers and
     descriptions onto an earlier draft's rows, but **only where the label is
     still the untouched default** — a deliberate rename is never clobbered.
     Tested both directions.
  1b. **Owner decisions (two rounds of narrowing), already applied**: first
     "no SSN/TIN in my system" — which killed the W-9 upload, since a signed
     W-9 has the TIN printed on it. Then "still too much friction, just let
     me make those assumptions and output a W-9 worksheet for my accountant"
     — which killed the profile table outright. **There is now no
     `contractor_tax_profiles` table, no `tax_entity_type` enum, no write
     path, and no bucket.** The 1099 tab reads only `contractor_invoices` +
     `user_profiles.username`, states its assumptions instead of asking, and
     its deliverable is a downloadable W-9 worksheet: app-known columns
     pre-filled, W-9 columns blank for the accountant. Guarded by SQL
     assertions on the absence of every piece of that apparatus, plus a
     browser assertion that the tab renders **zero inputs/selects/textareas**
     — so data entry can't come back without failing a test.
  2. **Frontend rebuild** — `deploy-ledgerx`. Confirm the footer reads `v13.15`.
  3. **First-use setup**: **Labs -> Tax Center -> Mapping** tab, pick a tax line for
     each category (they're listed with usage counts so the ones that matter
     come first). Until that's done the Schedule E tab shows everything as
     "unmapped" (by design — nothing is silently dropped). Nothing to do in
     Manage -> Categories; that screen is untouched by the tax features.
  4. No VPS/poller changes.
- **v13.14 in one paragraph**: the user asked for filtering/sorting on the
  transaction list to be redesigned "world-class" and mobile-first, then
  discovered along the way that two real call sites
  (`Dashboard.tsx`'s contractor "My Receipts" and `AdminLayout.tsx`'s
  household-admin "My Transactions") had `hideFilters` hardcoded — meaning
  search/sort/filter didn't exist at all for those roles' own-submission
  views, not even the compact "Filter" chip. Fixed by removing the `hideFilters`
  prop from `ExpenseList.tsx` entirely (it had exactly one caller each, both
  now get the same toolbar everyone else does) and simplifying the dead
  conditionals that referenced it. On top of restoring parity, added: (1) a
  new **matched/unmatched filter** — only surfaces when
  `useLabsAccess().hasFlag('labs_cc_reconciliation')` is true, since
  regular members/contractors never have Labs households and would never see
  a meaningful matched/unmatched split; (2) **one-tap quick chips** (household
  + matched/unmatched) rendered inline above the results, so the common case
  never requires opening the full filter panel — the chip row fades its
  trailing edge via `mask-image`, but ONLY while it's actually overflowing
  (checked via `ResizeObserver` comparing `scrollWidth`/`clientWidth`), so a
  user with just 2 households never sees a permanently-clipped last chip; (3)
  the filter panel itself moved out of an inline `<div>` into a new
  `ExpenseFilterSheet.tsx` component, lazy-loaded, styled as a bottom sheet on
  phones / centered dialog on desktop — the exact same
  `items-end sm:items-center` + `rounded-t-2xl sm:rounded-2xl` convention
  `StatementHouseholdsModal.tsx` already established; (4) **"Show N more"
  pagination** — renders 20 rows at a time via a `visibleCount` state that
  resets on any filter/sort/search change but deliberately NOT on `expenses`
  itself changing, so a background poll/reload doesn't yank a scrolled-down
  user back to page 1. Zero new SQL, zero new RPCs — purely a frontend
  rework of `ExpenseList.tsx` plus the two call-site prop removals. **Tested
  without a live Supabase backend** (no `.env` in this container): built a
  temporary, git-ignored preview harness
  (`dev-preview.html` / `src/dev-preview-entry.tsx`, both deleted before
  commit) that mounted three real `<ExpenseList>` instances — admin/35-expense
  (pagination), contractor-own-submissions/1-household (verifying the
  previously-broken `hideFilters` view now works), household-admin-own/
  4-household — each wrapped in its own mocked `AuthContext.Provider` (which
  required briefly `export`-ing `AuthContext` from `AuthContext.tsx`, then
  reverting that export before commit — grep confirms it's back to
  unexported). Drove it with the globally-installed Playwright CLI
  (`/opt/node22/bin/playwright`, not a project dependency) at both a 1280×900
  desktop viewport and a 390×844 mobile viewport: search, sort, household
  chips, matched/unmatched chips, the bottom-sheet filter panel (open/close/
  "Show N results"), and "Show N more" pagination all verified working via
  screenshots; separately verified the chip fade-mask appears when chips
  genuinely overflow (4 households + 2 status chips at 390px) and does NOT
  appear when they fit (2 households, no Labs). Verified: typecheck, lint,
  and `npm run build` all clean; i18n key parity (1048/1048 en/pt-BR).
- **v13.13 in one paragraph**: two independent things, both requested live in
  the same session after v13.12 had already merged. (1) **Word-doc receipts now open
  in a preview instead of only downloading.** v13.12 fixed `.docx` receipts
  being silently dropped by extracting their text into `body_text` — but the
  user then asked why tapping the attachment in the inbox just downloads it
  instead of opening inline, the way a PDF does. No browser renders `.docx`
  inline, and the two real alternatives (Microsoft/Google's online embed
  viewers) would mean sending the receipt's signed URL to a third party —
  flagged to the user as a privacy tradeoff rather than silently built. Went
  with an in-house alternative instead: `poll_email_inbox.py` gained
  `docx_text_to_preview_pdf()`, which HTML-escapes the already-extracted text
  and renders it through the *same* `render_html_to_pdf()` (weasyprint)
  pipeline already used elsewhere in this file — no new dependency. The
  generated preview PDF is inserted into `attachments` immediately before the
  original `.docx` (which is never removed — an explicit constraint from an
  earlier round of this same bug report: "it NEEDS to be present as that's
  the actual receipt"). Zero frontend changes needed — `EmailInboxPanel.tsx`
  and `AddExpense.tsx` already open any `application/pdf` attachment inline
  via signed URL; the preview PDF just rides that existing path. Tested
  against the user's real uploaded `.docx` file (extraction, PDF generation,
  HTML-escaping of special characters, missing-weasyprint degradation,
  multiple-docx-attachments pairing) — all assertions passed, plus a manual
  round-trip check (extracted text back out of the generated PDF via PyMuPDF
  to visually confirm it matches the source). **No new VPS steps beyond what
  v13.12 already required** — weasyprint and python-docx are both already
  installed there; this only changes code in the same already-updated
  `poll_email_inbox.py` file, so it needs the same one `cp` to `/opt/ledgerx/`
  as v13.12's docx fix, nothing additional. (2) **Auto Reconcile restricted
  to full admins + marked Labs.** Live mid-session, the user pointed out Auto
  Reconcile "still needs work and we aren't there yet" and asked for it to
  move back into a Labs-style gate — it's had two real bugs this session
  alone (the original blank-screen root cause, and the currency-arg /
  raw-cast fixes in v13.10). The button in `StatementList.tsx` was previously
  shown to anyone who could reach the statement list at all (full admins AND
  household admins); now gated to `isAdmin` only, with a small violet "Labs"
  badge next to the label so it reads as explicitly experimental even to the
  admins who still see it. `CreditCardReconciliation.tsx` also bounces back
  to the list view if a non-admin somehow lands on the `autoReconcile` view
  state (defense in depth, mirrors the "never render blank" principle behind
  this session's error-boundary work). Deliberately NOT a new per-household
  `labs_*` flag — Auto Reconcile is a global cross-household sweep, not a
  per-property feature, so a role check is the more honest gate than
  inventing a flag that doesn't map onto what the tool actually does. Zero
  new SQL for either half of v13.13. Verified: typecheck/lint/build clean
  (same 15 pre-existing lint findings, none new), i18n key parity (1044/1044
  en/pt-BR), 15 assertions on the docx-preview path including the real user
  file.
- **⚠️ Real mistake worth flagging so it doesn't repeat**: after PR #91
  merged, two more commits (the candidate-pool exclusion fix and the .docx
  fix, both described below) got pushed to the SAME branch out of habit —
  but GitHub does not attach new commits to an already-merged/closed PR, so
  they sat unmerged with no PR open until the user asked "everything merged
  right?" and a direct check (`git log origin/main..branch`,
  `list_pull_requests` state=open) caught it. **Always re-verify merge state
  before assuming a push landed anywhere** — a branch name being "the
  designated branch" does not mean every push to it is inside an open PR.
  Those two fixes are now correctly their own version, v13.12, in a fresh PR.
- **✅ Manual steps for v13.10 + v13.11 + v13.12 + v13.13 — all confirmed
  done this session**: poller `cp` + venv pip installs on the VPS, and the
  v13.10 Activity Report SQL migration confirmed applied in production (see
  above). Historical detail on what each required is kept below for
  reference.
- **⚠️ Pending manual step for v13.14 (this session)**: **frontend rebuild
  only** — `deploy-ledgerx` (`npm ci && npm run build && rsync dist/ →
  /var/www/ledger.90ten.life/`). No SQL, no VPS poller changes — this release
  is 100% frontend (transaction-list filter/sort/pagination rework, see
  above). Confirm the footer shows `v13.14` after deploying.
- **v13.10 in one paragraph** (merged): three things landed in the same session. (1) A
  household admin ("onion") reported Auto Reconcile showing a totally blank
  screen even after a hard refresh — traced to **Step 4 of the v13.8 SQL
  rollout never actually being applied** (`list_unlinked_expenses()` and
  `list_open_statement_line_items()` didn't exist; confirmed via
  `SELECT proname FROM pg_proc WHERE proname IN (...)` returning 0 rows — that
  query is worth keeping as a general diagnostic for "new RPC branch returns
  nothing"). Also closed a real architectural gap while investigating: **there
  was no React error boundary anywhere in this app**, so any future
  render-time exception (including the classic stale-lazy-chunk-after-deploy
  failure) would blank the entire page with zero signal — added
  `src/components/ErrorBoundary.tsx`, wraps the root in `main.tsx`, and
  auto-reloads once on the specific "Failed to fetch dynamically imported
  module" error text. (2) New feature: `AddExpense.tsx` gained an inline
  "Possible card charge" panel (`StatementMatchPanel.tsx`) that live-scores
  against `list_open_statement_line_items()` while reviewing a forwarded
  receipt, **before** it's saved — selecting a candidate links it via the
  existing `match_statement_line_item` RPC right after the real save succeeds,
  deliberately NOT via `match_inbox_item_to_line_item` (that RPC builds the
  expense from `email_inbox.prefilled` server-side, which would silently
  discard any correction the user made to the form). Zero new SQL. (3) Bug
  fix: `list_team_activity` and `list_team_member_last_login` both had
  `au.id <> auth.uid()` in the household-admin branch — literally excluding
  the caller's own activity/name from their own report. Full admins never had
  this exclusion; it was an asymmetry, not an intentional rule. Fixed in
  `20260801000000_activity_report_self_inclusion.sql`.
- **v13.11 in one paragraph** (MERGED, PR #91): (1) Clicking an already-matched
  line item in `StatementReconcile.tsx` did nothing — `onClick` explicitly
  skipped `setSelectedId` for matched items (`if (!isMatched) ...`), so the
  right pane stayed on the static "select a line item" placeholder forever.
  Fixed by always setting selection, and adding a real "Matched receipt"
  detail branch (vendor/date/amount/household/submitter + signed-URL image +
  Undo) instead of falling through to the candidate-picker UI. (2) Added a
  circular match-percentage ring around each statement's icon in
  `StatementList.tsx` (gray/amber/emerald by completion) per user request —
  purely cosmetic, no new data needed. (3) An adversarial review pass on the
  whole bundle before merge caught three real bugs, all fixed in this same
  version: **(a)** `AddExpense.tsx`'s "keep adding" flow didn't clear
  `selectedLineItemId` in `resetForm()` — since `match_statement_line_item`
  has no already-matched guard, a second save in the same session could
  silently steal the first save's match and reassign it to the wrong expense,
  with zero error shown. **(b)** the statement-match RPC call in
  `saveExpense()` wasn't in its own try/catch, so a THROWN (not
  `.error`-shaped) rejection would propagate to the outer catch and report the
  whole save as failed even though the expense had already been inserted —
  risking a duplicate resubmission. Both are now isolated so a match-link
  failure can never undo or misreport an already-successful expense save.
  **(c)** `ErrorBoundary.tsx`'s reload-guard used `sessionStorage` directly
  with no protection against it throwing (private-browsing modes), AND once
  the auto-reload had fired once per tab session, ANY subsequent stale-chunk
  crash rendered `null` forever with no fallback — contradicting the
  component's own stated intent. Fixed with safe wrapper functions around
  `sessionStorage` and by keying the "suppress the fallback UI" decision off
  a local per-crash instance flag (reset on every mount) instead of the
  session-persistent guard, plus a 3-second safety-net timer in case
  `window.location.reload()` is silently blocked. Also hardened
  `AutoReconcile.tsx`'s `load()` to build all three RPC results into local
  variables and commit them with `setState` together at the end, so a
  mid-mapping throw can no longer leave `openItems`/`expenses`/`inboxRows` in
  a combination that never existed together on the server. Verified: 30+
  independent Postgres re-verification assertions on the v13.10
  activity-report migration (multi-household admins, admins removed from all
  households — no regressions), typecheck/lint/build clean, i18n parity.
- **v13.12 in one paragraph** (unmerged — new PR needed, see the mistake noted
  above): two fixes landed on the branch AFTER PR #91 had already merged, so
  they need their own version + PR. (1) Found live via a screenshot: a
  GoDaddy receipt already matched to one line item kept showing up as a
  selectable candidate for a completely different charge on the SAME
  statement — `claimedElsewhere` (the cross-statement exclusion) was
  deliberately scoped to exclude the current statement's own matches, and
  nothing else covered that case. Fixed by deriving `matchedOnThisStatement`
  from the already-loaded `lineItems` (no new query) and excluding it
  alongside `claimedElsewhere` in `combinedPool`. (2) Found live via a
  screenshot: a **.docx (Word) attachment forwarded as the actual receipt**
  (a contractor invoice) was silently dropped entirely — it matched no entry
  in `poll_email_inbox.py`'s `ALLOWED_TYPES`, so `attachments` ended up empty
  and the poller's own "no real attachment, render the HTML body to PDF"
  fallback fired on the WRAPPER email text ("Attached please find the
  receipt...") instead, producing a synthetic PDF of the cover note with none
  of the actual receipt content. Fixed by recognizing `.docx` (including when
  a client mislabels it as generic `application/octet-stream` — matched by
  extension as a fallback) and extracting its real text with `python-docx`
  (paragraphs + table cells, since a lot of invoice line-items/totals live in
  a table) directly into `body_text` — no OCR needed at all, since unlike a
  scanned receipt this content is already machine-readable. This also
  naturally prevents the wrong-PDF fallback from firing at all once the docx
  is a real, non-dropped attachment. Old binary `.doc` (not `.docx`) isn't
  handled — `python-docx` only reads the OOXML format. Two matching frontend
  fixes: `EmailInboxPanel.tsx`'s generic attachment tile was hardcoded to
  label everything "PDF"; now derives the label from the real extension.
  `AddExpense.tsx`'s inbox-attachment preview rendered ANYTHING that wasn't
  literally `application/pdf` as an `<img>` — a `.docx` would show a broken
  image icon; inverted to image-first (renders the generic file tile for
  anything non-image), and the auto-OCR-on-open call is now gated to
  image/PDF types only so a `.docx` never gets sent into a scan that can't
  read it. **Zero new SQL for any of v13.12.** Verified: typecheck/lint/build
  clean, i18n parity, plus 16 assertions on the docx extraction path (real
  generated .docx via python-docx, mislabeled content-type recognition,
  missing-dependency degradation, corrupt-file handling).
- **Pending manual steps for v13.9 (PDF receipts never got OCR'd)**:
  1. **`/opt/ledgerx/venv/bin/pip install pymupdf` on the VPS — NOT system
     pip3/apt.** Confirmed 2026-07-25: cron runs
     `/opt/ledgerx/venv/bin/python3` (with `. /opt/ledgerx/env` sourced first
     for env vars), not `/usr/bin/python3` as QUICK_START previously and
     wrongly documented (now fixed). `apt install python3-fitz` installs
     system-wide and is invisible to that venv — wasted effort, caught live
     during this deploy. weasyprint likewise only exists in the venv. Then
     copy the updated `scripts/poll_email_inbox.py` to `/opt/ledgerx/`.
     Without the wheel the poller still runs — the import is guarded — it
     just doesn't rasterize, i.e. today's behaviour.
  2. Redeploy `inbound-email`. **⚠️ The live copy has drifted from the repo
     (gotcha #7) — diff before pasting, do NOT wholesale-replace.** The two
     changes needed are small: drop `|| a.content_type === "application/pdf"`
     from the `ocrTarget` filter, and route the four `if (!resp.ok) return {}`
     sites through the new `logOcrFailure()` helper.
  3. Verify: forward a Lowe's-style receipt, wait one poll cycle (≤5 min), then
     `SELECT prefilled FROM email_inbox ORDER BY received_at DESC LIMIT 1;`
     — expect a populated `total_amount`.
- **The v13.9 bug, for the record** (found while deploying v13.8): production
  had **23 pending expense receipts, 0 with an OCR'd amount**, every one a PDF.
  Two independent defects stacked:
  1. `inbound-email` passed PDFs to OpenAI's vision endpoint as a
     `data:application/pdf;base64,…` URL. That endpoint takes JPEG/PNG/WEBP/GIF
     only — it 400s — and `if (!resp.ok) return {}` swallowed it silently. The
     `ocrTarget` filter directly contradicted `isOcrSupportedImage`'s own doc
     comment two definitions above it.
  2. The poller, when it rendered an HTML body to PDF, **nulled out
     `body_text`/`body_html`** on the reasoning that the PDF superseded them.
     So the inline-body fallback had nothing left to read either. Both paths
     dead → `prefilled` was literally `{}` rather than a set of nulls.
  Fix rasterizes page 1 to PNG in the poller and inserts it **ahead of** the
  PDF, which matters: `inbound-email` scans for the *first* OCR-compatible
  attachment, so the fix works against the currently-deployed function even
  before step 2 lands. **Already-pending rows do not self-heal** — a backfill
  script would be needed if those 23 should be prefilled.
- **Generalizable lesson**: a bare `return {}` on a non-OK HTTP response is
  indistinguishable from "found nothing". Both OCR paths failed for months with
  zero log output. Log the status.
- **✅ v13.7 is DEPLOYED and confirmed working.** The user ran
  `20260730000000_activity_email_pending.sql` on 2026-07-25 and the pending
  rows appeared. The earlier "options show but no data" report was simply the
  migration not having been run — the frontend had already shipped, and
  `EVENT_TYPES` is client-side, so the filter option renders regardless of what
  the DB knows. **Diagnostic worth reusing** for any "new RPC branch returns
  nothing" report:
  `SELECT count(*) FROM pg_proc WHERE proname='<fn>' AND prosrc LIKE '%<marker>%';`
  — `0` means the migration never ran, and no amount of frontend debugging will
  help.
- **⚠️ Pending manual steps for v13.8 (review queue + global Auto Reconcile)**:
  1. Run migration **`20260731000000_review_queue_and_auto_reconcile.sql`**.
  2. Deploy the new edge function **`send-review-reminder`** (paste into the
     dashboard — no CLI linked on this project).
  3. Schedule the cron using the session-`SET` + `cron.schedule` single-Run
     pattern from deploy gotcha #9, then verify with
     `SELECT jobname, schedule FROM cron.job;`. **While you're there, check
     whether `ledgerx-inactivity-reminders-daily` actually exists** — per
     gotcha #9 its GUC was never set on this project, so it may never have
     fired since v10.1.
  4. Rebuild + rsync the frontend (`deploy-ledgerx`). No new secrets —
     `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `APP_URL`, `CRON_SECRET` are
     all already set.
  5. Optional smoke test before scheduling cron: POST to the function with
     `{"dry_run": true}` and the `X-Cron-Secret` header — it returns exactly who
     *would* be emailed without sending anything or writing `notification_log`.
- **🔒 Security fix folded into v13.8 — read this.** Writing
  `list_review_reminder_recipients` surfaced a project-wide privilege trap.
  Every backend-only RPC here is declared as
  `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO service_role;`
  which *reads* as "service role only" but isn't: Supabase's platform default
  privileges grant EXECUTE on each new public-schema function directly to
  `anon` and `authenticated`, and revoking PUBLIC does not remove an explicit
  role grant. Several of the affected functions return **real contact email
  addresses**; two are mutations. Reproduced in plain Postgres 16 and confirmed
  both directions. The migration adds a hardening block that revokes
  `anon`/`authenticated` by name from 13 such functions (verified first that
  none are called from `src/` — the only two textual hits are a code comment
  and a generated type). `20260525000000_harden_last_activity_fn.sql` had
  already done this by hand for one function, so the intent was established.
  **Going forward: for any service-role-only function, revoke the roles by
  name — `REVOKE ... FROM PUBLIC` is not sufficient.**
- **✅ v13.7 details (shipped)**:
  1. Migration **`20260730000000_activity_email_pending.sql`** — full
     `CREATE OR REPLACE` of `list_team_activity`, preserving all existing
     branches verbatim, adding one new UNION sourcing `email_inbox`
     WHERE `status='pending'`. **Applied 2026-07-25.**
  2. **Follow-up from the v13.6 email incident**: once the mailbox issue
     resolved, a user asked why 19 successfully-processed forwarded receipts
     weren't showing in the Activity report for that team member. Diagnosis
     (confirmed correct-by-design, not a bug): `list_team_activity`'s
     "Submitted receipt" event is a live `SELECT` off `expenses` — it only
     exists once a human opens the pending `email_inbox` card and hits Save
     (the same action that both creates the `expenses` row and flips the
     inbox row to `'accepted'`). A forwarded email sitting unreviewed has no
     `expenses` row yet, so there was nothing to show — expected behavior.
  3. Rather than leave that gap, added a new, distinct event type
     **`email_pending`** sourced directly from `email_inbox` pending rows.
     Two things that make it behave differently from every other event type
     in this report, both intentional (see the migration's header comment):
     - **Transient, not historical** — it's a live snapshot of current
       pending state, not a permanent log. Once an item is reviewed
       (accepted or discarded), it naturally drops out of the feed on the
       next query, since `status` is no longer `'pending'`. Re-querying a
       past date range after review won't show it anymore — by design.
     - **`household_id` is always NULL** — email_inbox has no household
       until the item is accepted into a real expense. Filtering the report
       to one specific household correctly excludes these rows; only "All
       households" surfaces them.
  4. Frontend (`ActivityReport.tsx`): new event type renders with an amber
     `Mail` icon/badge, no click-to-open (nothing to open yet), and shows
     the OCR-guessed vendor/subject in the household column instead of a
     blank dash.
  5. Tested against a full migration replay on local Postgres 16 (custom
     minimal scaffold covering `expenses`/`contractor_invoices`/`estimates`/
     `email_inbox`/household scoping) — 7 assertions: full admin sees both
     the historical expense + the new pending events; household admin scoping
     matches every other event type exactly (sees own household's pending
     item, not another household's); household-filter correctly excludes
     pending rows; event-type filter isolates `email_pending`; an accepted
     item disappears from the feed on the next query; existing
     `expense_created` unaffected (regression check).
- **⚠️ Pending manual steps for v13.6 (bug fixes: household sort order + receipt-date reset)**:
  1. **One edge function redeploy** (`inbound-email`), **plus VPS rsync for the frontend**.
     No SQL migration, no new secrets.
  2. **Root incident that surfaced these**: a user reported a forwarded receipt
     wasn't showing up. Investigation found the inbound-email pipeline itself
     was healthy (VPS cron running every 5 min, IMAP connecting fine) — the
     mailbox (`receipts@90ten.life`) had simply stopped receiving new mail
     entirely since Jul 17 (confirmed: last message in the mailbox, `\Seen`
     and all, was Jul 17). That's a Hostinger/DNS-side issue outside the
     app — MX records were confirmed correct; user was checking mailbox
     quota/hPanel status separately. Not something this repo can fix.
  3. **Real bug #1 — household dropdowns in arbitrary order**: `households.id`
     is a random uuid, so any query without an explicit `ORDER BY` returns
     rows in undefined order. `loadAllHouseholds()` (admin path) already had
     `.order('name')`; **7 other call sites didn't**: `loadUserHouseholds()`
     in `src/lib/queries.ts`, plus independent duplicate `household_members`
     queries in `useExpenses.ts`, `useLabsAccess.ts`, `useInvoices.ts`,
     `InvoiceForm.tsx`, `EstimateForm.tsx` (non-admin branch), `ExportData.tsx`.
     Fixed by sorting client-side (`.sort((a,b) => a.name.localeCompare(b.name))`)
     after each fetch rather than relying on PostgREST nested-order syntax.
  4. **Real bug #2 — receipt/invoice date silently reset to today on inbox review**:
     `AddExpense.tsx`/`InvoiceForm.tsx` only re-ran client-side OCR on mount
     when *no* field at all had a server-side prefill (`hasPrefill = vendor ||
     total || date`). If the inbound-email edge function's OCR pass found
     vendor/total but missed the date (common — dates are the hardest field),
     the retry was skipped entirely and the form fell back to today's date
     with no visual cue anything was wrong. Fixed: the gate now checks
     specifically for the date (`hasDate = !!initialData?.expense_date`),
     so a retry fires whenever the date is the field that's missing,
     regardless of what else came through. Verified safe: `applyReceiptDataToForm`
     / `applyOCRData` merge field-by-field and never clobber an already-good
     value, so retrying when vendor/total are already set is harmless.
  5. **Related fixes caught during the same investigation**: (a)
     `src/lib/receiptScanner.ts` was sending the client's "today" to
     `extract-receipt` as UTC (`new Date().toISOString().slice(0,10)`)
     instead of local time (`todayDateString()`), skewing the server-side
     year-plausibility check by up to a day depending on the user's UTC
     offset. (b) `supabase/functions/inbound-email/index.ts`'s
     `repairImplausibleYear()` had drifted from `extract-receipt`'s — it was
     still "fixing" (rewriting the year of) any receipt dated **more than 13
     months in the past**, contradicting this feature's whole purpose
     (reconciling old statements/receipts) and the explicit past decision to
     only ever correct *future*-dated OCR misreads. Now matches
     `extract-receipt` exactly (day-diff check, future-only) — verified with
     a standalone script: a 10-year-old date passes through untouched, a
     1-year-future misread gets pulled back a year. **This is the edge
     function that needs redeploying.**
- **⚠️ Pending manual steps for v13.5 (Reconciliation promoted out of Labs + UI/IA cleanup)**:
  1. **No SQL migration, no edge function, no secrets.** Frontend-only — just VPS rsync.
  2. **Credit Card Reconciliation graduated out of "Labs"** into a first-class
     feature. It's now a normal nav item + admin-home "Review" tile, gated on
     `hasFlag('labs_cc_reconciliation')` (NOT `hasAnyLabsFlag`). **The DB access
     model is untouched** — the per-household `labs_cc_reconciliation` flag,
     `statement_households`, and every `is_labs_eligible(...)`/`can_act_on_expense`
     policy/function stay exactly as-is. This was purely nav/branding: deleted
     `LabsHome.tsx` + `LabsBadge.tsx`, `AdminLayout` renders
     `CreditCardReconciliation` directly under `activeView==='reconciliation'`
     (was `'labs'`), the `statement_line_item` notification deep-link now targets
     that view, violet "Labs" accent recolored → emerald across the CC screens.
     The `labs.cc.*` i18n key NAMES were deliberately left as-is (internal ids);
     only user-visible values changed. Dead keys `labs.badge`/`labs.home.*`/
     `labs.experimentalNotice` remain (harmless). `useLabsAccess().hasAnyLabsFlag`
     is now unused but left in place.
  3. **Existing statements can be re-tagged to households** (was upload-only):
     new `StatementHouseholdsModal` + a `Building2` button per row in
     `StatementList`; `CreditCardReconciliation.handleEditHouseholds` does
     delete-all-then-insert on `statement_households` (direct client writes,
     admin RLS allows it).
  4. **UI/IA cleanup**: admin home split into Quick Actions / Review / Insights /
     Configuration; mobile menus consolidated (account actions moved into the
     hamburger drawer, avatar `UserMenu` is now `hidden lg:block` so there's one
     menu button on mobile); label fixes via shared i18n values — "Submit
     Estimate" (was "Submit an estimate"), "Inbox" (was "Email Inbox"), "Estimate
     Report", and the Manage-Households feature checkbox is now just "Credit Card
     Reconciliation" (flag key unchanged). These shared-key edits also flow to the
     non-admin Dashboard automatically.
- **⚠️ Pending manual steps for v13.4 (scope a statement to specific households)**:
  1. SQL editor: run **`20260729000000_statement_household_scoping.sql`**
     (idempotent; replayed against local Postgres 16 — scaffold + full
     `…722`→`…729` chain — 5 assertions: scoped statement includes its
     household's expenses + any category-NULL expense regardless of
     household, excludes another household's categorized expense; unscoped
     legacy statement and `NULL`/zero-arg calls all fall back to the full
     broad pool unchanged; household admin sees the same scoping within
     their own visibility). Adds `statement_households` junction table
     (admin-write, Labs-eligible-read) and **replaces**
     `list_reconciliation_candidates()` with a 1-arg version
     (`p_statement_id uuid DEFAULT NULL`) — old zero-arg calls still resolve
     (tested explicitly) since the old signature is dropped first, not left
     ambiguously overloaded.
  2. **No edge function, no new secrets.** VPS rsync for the frontend.
  3. Why: the prior broad "every Labs-flagged household at once" pool was
     genuinely suppressing automatic matching — two properties' charges at
     an identical amount are indistinguishable to the matcher, which quietly
     kills the high-confidence auto-match bar for both. Tagging a statement
     with its actual household(s) at upload (optional — `StatementUpload.tsx`
     gained a multi-select of Labs-flagged households) narrows the pool and
     makes auto-match meaningfully more decisive, without changing anything
     for a statement left untagged (today's exact behavior, unchanged).
  4. Deliberate exception: ANY expense with no category yet (`category IS
     NULL`) always appears as a candidate regardless of household or
     scoping — it's likely misfiled/unresolved data that could belong to
     this statement even if it landed in the wrong household or none.
     `can_act_on_expense()` was deliberately left untouched (still the
     broader, unscoped authorization check) — the narrowing only affects
     what's *suggested*, not what a Labs-eligible admin is *authorized* to
     act on, so there's no risk of the narrower suggestion list silently
     blocking a legitimate manual match found via search.
  5. `candidateExpenses` loading moved from "once at the `CreditCardReconciliation`
     parent, regardless of which statement is open" to "per open statement" —
     `useReconciliationCandidates` gained a `statementId` param threaded from
     `view.reconcile.id`. A statement's assigned households (if any) now
     surface as a small "Scoped to: ..." label in both `StatementList` and
     `StatementReconcile`'s header, loaded via a `statement_households` join
     in `CreditCardReconciliation.loadStatements()` — this is deliberately
     visible so a scoped statement never silently hides receipts without
     explanation.
- **⚠️ Pending manual steps for v13.3 (auto-match against email inbox + in-flow categorize)**:
  1. SQL editor: run **`20260728000000_labs_inbox_matching.sql`** (idempotent;
     replayed against local Postgres 16 — scaffold + `expense_images` +
     `email_inbox` + the full `…722`→`…728` CC-reconciliation chain — 12
     assertions across all 3 new RPCs, including an atomic-rollback case).
     Adds `list_reconciliation_inbox_candidates()`, `match_inbox_item_to_line_item()`,
     `set_expense_category()`.
  2. **No edge function, no new secrets.** VPS rsync for the frontend.
  3. **Scope decision**: inbox-sourced matching is **full-admin only** — `email_inbox`
     has no household_id and no existing RLS precedent for household-admin
     visibility, so this deliberately doesn't extend the way plain expense
     matching does. Categorizing a candidate (`set_expense_category`) IS open to
     household admins too, gated by the same `can_act_on_expense()` already
     backing match/unmatch.
  4. UX: inbox candidates merge into the existing Suggested/browse lists (amber
     "Inbox" badge) and into the auto-match preview (expense-sourced pairs stay
     a true one-click bulk confirm via `bulk_match_statement_line_items`;
     inbox-sourced ones each get their own inline household+category mini-form
     since a brand-new expense can't have its household guessed). Confirming an
     inbox match downloads the attachment from the email-inbox storage path and
     re-uploads it under the chosen household (mirrors `AddExpense.tsx`'s own
     inbox-to-expense path — Postgres can't move storage bytes itself), then
     the RPC atomically creates the expense + `expense_images` rows, flips the
     inbox row to `accepted`, and matches the line item. Any candidate (inbox-
     or expense-sourced) missing a category gets an inline picker that saves
     immediately via `set_expense_category`, independent of match timing.
  5. New files: `src/hooks/useReconciliationInboxCandidates.ts`,
     `src/components/labs/InboxCandidateMatchForm.tsx`,
     `src/components/labs/CategoryQuickPicker.tsx`. `useReconciliationCandidates`
     and the new inbox hook both gained a `refreshKey` param — bumped after an
     inbox match so the parent's candidate pool (and Undo/vendor UI on the
     freshly-matched line item) picks up the brand-new expense without a remount.
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

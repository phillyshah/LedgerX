# LedgerX

Shared household expense tracker with receipt OCR and admin analytics. React 18 + TypeScript + Vite + Tailwind on Supabase (Postgres + Auth + Storage + Edge Functions).

## Critical Rules

- **Auth**: Use `useAuth()` from `src/contexts/AuthContext.tsx`. Username-based — internal email pattern is `username@ledgerx.local`. Never expose real emails.
- **Dates**: Parse with `dateString.split('-').map(Number)` → `new Date(year, month-1, day)`. NEVER `new Date(dateString)` — UTC off-by-one.
- **RLS**: All tables use Row Level Security. Never use service role key in frontend.
- **Images**: Receipts in private `receipts` bucket — signed URLs only. Dual-write to `expenses` (legacy fields) AND `expense_images` table.
- **Version bump**: Every change merged to main MUST increment version by `0.1` in `package.json` AND `src/version.ts`. Current: `v7.8`.
- **Branding**: Wordmark is rendered via `<LogoText />` (`src/components/LogoText.tsx`) so the "beta" superscript stays in sync everywhere. Never hardcode the string "LedgerX" in headers — import the component.
- **Roles**: Three role flags on `user_roles` — `is_admin` (full admin), `is_household_admin` (scaled-down admin: analytics/invoices/reports for member households, no user/household/category mgmt, no mark-paid. Can submit their own receipts + invoices just like contractors), `is_contractor` (submit-only). Invoice status is binary: `pending` | `paid`.
- **Invoice categories**: `contractor_invoices.category_id` can be set by the submitter on insert (picker filters to globals + categories mapped to the selected household via `category_households`). Full admins can change it after submission via the `admin_set_invoice_category` RPC.
- **Invoice detail view**: Submitters (contractors + household admins) can tap any invoice row in `InvoiceList` to open a read-only detail modal with signed-URL attachments. Admin version (`AdminInvoices`) adds mark-paid + reassign-category buttons on top of the same detail shell.
- **i18n — mandatory**: Every user-visible string MUST use `t('key')` from `useT()`. Add the key to BOTH `src/i18n/en.json` AND `src/i18n/pt-BR.json` in the same commit. Never hardcode locale `'en-US'` — use `locale` from `useT()`. See `.claude/ARCHITECTURE.md#i18n`.
- **Help docs — mandatory**: Any user-visible feature add/change requires updating BOTH `README.md` AND `README.pt-BR.md`. HelpModal auto-switches on language. Treat docs as part of the feature.
- **What's New — mandatory**: Every feature shipped MUST add an entry to `src/i18n/releaseNotes.ts` (newest first) AND add the version emoji to `VERSION_EMOJI` in `src/components/LoginWhatsNewModal.tsx`. The entry must have both `en` and `pt-BR` body text written in plain, user-friendly language (not developer jargon). The login modal always shows the top 2 entries; the in-app bell shows all.
- **GitHub is the master; the local drive is a disposable copy.** `origin` (GitHub) is the single source of truth for code AND the reference for what actually shipped. Every change must live online — commit and push; never leave work only on the local working copy (the container is ephemeral and reclaimed). Before overwriting or force-pushing a branch, `git fetch` and reconcile against `origin`: account for every commit that exists online but not locally (a merge may have dropped later commits — verify `origin/main` really contains your review fixes) and preserve or intentionally supersede each one. When local and online disagree, online wins — investigate, don't clobber.
- **Push to main**: Every completed change must be committed and pushed to `origin/main` before wrapping up.
- **Deploy**: `npm run build` → `rsync -avz --delete dist/ root@72.62.174.193:/var/www/ledger.90ten.life/` (production URL: `https://ledger.90ten.life`; old `ledger.phillyshah.com` 301-redirects to it)

## Subdocs

- **`.claude/HANDOFF.md` — READ THIS FIRST.** Current project state, latest
  session's work, environment specifics, and deployment gotchas. Update it at
  the end of any substantial session.
- `.claude/ARCHITECTURE.md` — directory layout, schema, data flow, i18n layer (stale as of `v11.2` — see HANDOFF.md)
- `.claude/QUICK_START.md` — commands, env vars, deploy
- `.claude/COMMON_MISTAKES.md` — recurring bugs to avoid
- `.claude/DECISIONS.md` — design rationale

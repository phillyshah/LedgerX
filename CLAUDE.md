# LedgerX

Shared household expense tracker with receipt OCR and admin analytics. React 18 + TypeScript + Vite + Tailwind on Supabase (Postgres + Auth + Storage + Edge Functions).

## Critical Rules

- **Auth**: Use `useAuth()` from `src/contexts/AuthContext.tsx`. Username-based — internal email pattern is `username@ledgerx.local`. Never expose real emails.
- **Dates**: Parse with `dateString.split('-').map(Number)` → `new Date(year, month-1, day)`. NEVER `new Date(dateString)` — UTC off-by-one.
- **RLS**: All tables use Row Level Security. Never use service role key in frontend.
- **Images**: Receipts in private `receipts` bucket — signed URLs only. Dual-write to `expenses` (legacy fields) AND `expense_images` table.
- **Version bump**: Every change merged to main MUST increment version by `0.1` in `package.json` AND `src/version.ts`. Current: `v5.4`.
- **Roles**: Three role flags on `user_roles` — `is_admin` (full admin), `is_household_admin` (scaled-down admin: analytics/invoices/reports for member households, no user/household/category mgmt, no mark-paid, no category assignment), `is_contractor` (submit-only). Invoice status is binary: `pending` | `paid`.
- **Invoice categories**: `contractor_invoices.category_id` is admin-assigned via `admin_set_invoice_category` RPC. Picker filters to globals + categories mapped to the invoice's household via `category_households`.
- **i18n — mandatory**: Every user-visible string MUST use `t('key')` from `useT()`. Add the key to BOTH `src/i18n/en.json` AND `src/i18n/pt-BR.json` in the same commit. Never hardcode locale `'en-US'` — use `locale` from `useT()`. See `.claude/ARCHITECTURE.md#i18n`.
- **Help docs — mandatory**: Any user-visible feature add/change requires updating BOTH `README.md` AND `README.pt-BR.md`. HelpModal auto-switches on language. Treat docs as part of the feature.
- **Push to main**: Every completed change must be committed and pushed to `origin/main` before wrapping up.
- **Deploy**: `npm run build` → `rsync -avz --delete dist/ root@72.62.174.193:/var/www/ledger.phillyshah.com/`

## Subdocs

- `.claude/ARCHITECTURE.md` — directory layout, schema, data flow, i18n layer
- `.claude/QUICK_START.md` — commands, env vars, deploy
- `.claude/COMMON_MISTAKES.md` — recurring bugs to avoid
- `.claude/DECISIONS.md` — design rationale

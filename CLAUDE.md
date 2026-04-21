# LedgerX

Shared household expense tracker with receipt OCR and admin analytics. React 18 + TypeScript + Vite + Tailwind on Supabase (Postgres + Auth + Storage + Edge Functions).

## Critical Rules

- **Auth**: Use `useAuth()` from `src/contexts/AuthContext.tsx`. Username-based — internal email pattern is `username@ledgerx.local`. Never expose real emails.
- **Dates**: Expense dates are `YYYY-MM-DD` strings. Parse with `dateString.split('-').map(Number)` then `new Date(year, month-1, day)`. NEVER `new Date(dateString)` — UTC off-by-one.
- **RLS**: All tables use Row Level Security. Never use service role key in frontend.
- **Images**: Receipts in private `receipts` bucket — signed URLs only. Dual-write to `expenses` (legacy fields) AND `expense_images` table.
- **Version bump**: Every set of changes merged to main MUST increment the version by `0.1` in both `src/components/AuthForm.tsx` AND `package.json`. Current version: `v4.0`. Example: `3.5` → `3.6` on the next change.
- **Help docs**: When a user-visible feature is added or changed, update `README.md` — the in-app HelpModal renders it directly. Add a new `##` section and a Table of Contents entry. Treat this as part of the feature, not a follow-up.
- **Push to main**: Every completed change must be committed and pushed to `origin/main` before wrapping up. Don't leave uncommitted work sitting locally.
- **Deploy**: After pushing, deploy with `rsync -avz --delete dist/ root@72.62.174.193:/var/www/ledger.phillyshah.com/` (requires VPS password). Always run `npm run build` first.

## Subdocs

- `.claude/ARCHITECTURE.md` — directory layout, schema, data flow
- `.claude/QUICK_START.md` — commands, env vars
- `.claude/COMMON_MISTAKES.md` — recurring bugs to avoid
- `.claude/DECISIONS.md` — design rationale

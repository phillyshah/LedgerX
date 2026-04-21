# LedgerX

Shared household expense tracker with receipt OCR and admin analytics. React 18 + TypeScript + Vite + Tailwind on Supabase (Postgres + Auth + Storage + Edge Functions).

## Critical Rules

- **Auth**: Use `useAuth()` from `src/contexts/AuthContext.tsx`. Username-based — internal email pattern is `username@ledgerx.local`. Never expose real emails.
- **Dates**: Expense dates are `YYYY-MM-DD` strings. Parse with `dateString.split('-').map(Number)` then `new Date(year, month-1, day)`. NEVER `new Date(dateString)` — UTC off-by-one.
- **RLS**: All tables use Row Level Security. Never use service role key in frontend.
- **Images**: Receipts in private `receipts` bucket — signed URLs only. Dual-write to `expenses` (legacy fields) AND `expense_images` table.
- **Version bump**: Every set of changes merged to main MUST increment the version by `0.1` in both `src/components/AuthForm.tsx` AND `package.json`. Current version: `v3.3`. Example: `3.3` → `3.4` on the next change.

## Subdocs

- `.claude/ARCHITECTURE.md` — directory layout, schema, data flow
- `.claude/QUICK_START.md` — commands, env vars
- `.claude/COMMON_MISTAKES.md` — recurring bugs to avoid
- `.claude/DECISIONS.md` — design rationale

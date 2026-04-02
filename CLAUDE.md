# LedgerX

Shared household expense tracker with receipt OCR, multi-household support, and admin analytics.

## Tech Stack

React 18, TypeScript, Tailwind CSS, Vite, Supabase (Postgres + Auth + Storage + Edge Functions), jsPDF, Lucide React

## Critical Rules

- **Auth**: Always use `useAuth()` from `src/contexts/AuthContext.tsx`. Username-based login (`username@ledgerx.local` email pattern) — never expose real emails.
- **Dates**: Expense dates are `YYYY-MM-DD` strings. Parse with `dateString.split('-').map(Number)` then `new Date(year, month-1, day)`. NEVER use `new Date(dateString)` — causes UTC off-by-one.
- **Categories**: Stored as text names on `expenses.category`, not foreign keys. Linked to `categories.name`.
- **RLS**: All Supabase tables use Row Level Security. Never use service role key in frontend code.
- **Images**: Receipt images in private `receipts` bucket. Access via signed URLs only. Always dual-write to both `expenses` (legacy) and `expense_images` table.
- **Data fetching**: Use `useExpenses` hook (`src/hooks/useExpenses.ts`) — shared by DashboardSummary and ExpenseList. Don't duplicate queries.

## Subdocs

- Architecture: `.claude/ARCHITECTURE.md`
- Commands: `.claude/QUICK_START.md`
- Gotchas: `.claude/COMMON_MISTAKES.md`
- Design decisions: `.claude/DECISIONS.md`

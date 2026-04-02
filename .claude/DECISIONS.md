# Design Decisions

## Username-based auth (not email)
Privacy-first: household members don't need to share emails. Auth uses `username@ledgerx.local` as the internal email for Supabase Auth. Lookup via `get_user_email_by_username()` RPC.

## Households as multi-tenant boundary
Each household is an isolated group of expenses, members, and categories. Maps naturally to: personal spending, shared house costs, rental properties, business accounts. RLS enforces isolation at the database level.

## Categories stored as text (not foreign key)
`expenses.category` is a plain text field matching `categories.name`. This means OCR can write a category name directly without an ID lookup. Simpler queries, no joins needed for display. Tradeoff: renaming a category doesn't cascade to existing expenses.

## Claude Haiku for receipt OCR
Switched from OpenAI to Claude Haiku (commit d80b0d2) for better cost/quality ratio on receipt vision tasks. Extracts vendor, amount, date, category, tax, tip, payment method, and items summary.

## Client-side filtering
All user expenses are loaded in one query via `useExpenses` hook. Search and filters run client-side with `useMemo`. This gives instant UX without round-trips. Works because per-household expense counts are manageable (hundreds, not millions).

## jsPDF for client-side exports
PDF generation runs entirely in the browser using jsPDF. No server-side dependency. Embeds receipt images directly. Tradeoff: large exports with many images can be slow.

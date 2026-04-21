# Design Decisions

## Username-based auth with optional real email
Privacy-first: household members don't need to share emails. Auth uses `username@ledgerx.local` as the internal Supabase Auth email. Login lookups via `get_user_email_by_username()` RPC which returns `COALESCE(real_email, email)`. Users can optionally add a real email via UserSettings → `update-user-email` edge fn, which unlocks password reset via `resetPasswordForEmail()`.

## Households as multi-tenant boundary
Each household is an isolated group of expenses, members, and categories. Maps naturally to: personal spending, shared house costs, rental properties, business accounts. RLS enforces isolation at the database level.

## Categories stored as text (not foreign key)
`expenses.category` is a plain text field matching `categories.name`. OCR can write a category name directly without an ID lookup. Simpler queries, no joins for display. Tradeoff: renaming a category doesn't cascade to existing expenses.

## OpenAI gpt-4o-mini for receipt OCR
Primary model is `gpt-4o-mini` with `gpt-4o` as fallback. Uses `detail: "low"` (512px internal downscale) — client compresses to ~300KB/800px before upload to minimize bandwidth. JSON mode guarantees valid JSON output.

## Client-side filtering
All user expenses are loaded in one query via `useExpenses` hook. Search and filters run client-side with `useMemo`. Instant UX without round-trips. Works because per-household expense counts are manageable (hundreds, not millions).

## jsPDF for client-side exports
PDF generation runs entirely in the browser. No server-side dependency. Embeds receipt images directly. Tradeoff: large exports with many images can be slow.

## SpendingCharts in both Dashboard and AdminAnalytics
Charts are rendered in `Dashboard` (user view) and re-used in `AdminAnalytics` (admin view) over the same filtered dataset. Admins are routed directly to AdminLayout and never see Dashboard, so the component must be wired into both.

## Hostinger VPS for hosting (not Bolt/Netlify)
Static `dist/` served by nginx at `72.62.174.193`. DNS managed by Hostinger (`ns1/2.dns-parking.com`). Bolt is no longer used — the project can be deleted from Bolt.

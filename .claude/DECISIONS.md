# Design Decisions

## Username-based auth (not email)
Privacy-first: household members don't need to share emails. Auth uses `username@ledgerx.local` as the internal email for Supabase Auth. Lookup via `get_user_email_by_username()` RPC.

## Households as multi-tenant boundary
Each household is an isolated group of expenses, members, and categories. Maps naturally to: personal spending, shared house costs, rental properties, business accounts. RLS enforces isolation at the database level.

## Categories stored as text (not foreign key)
`expenses.category` is a plain text field matching `categories.name`. This means OCR can write a category name directly without an ID lookup. Simpler queries, no joins needed for display. Tradeoff: renaming a category doesn't cascade to existing expenses.

## OpenAI gpt-4o-mini for receipt OCR
Switched back from Claude to OpenAI for cost reasons. Primary model is `gpt-4o-mini` with `gpt-4o` as fallback if the primary fails. Uses `detail: "low"` (OpenAI downscales to 512px internally) — so the client compresses to ~300KB/800px before upload to minimize bandwidth. JSON mode (`response_format: { type: "json_object" }`) guarantees valid JSON output.

## Client-side filtering
All user expenses are loaded in one query via `useExpenses` hook. Search and filters run client-side with `useMemo`. This gives instant UX without round-trips. Works because per-household expense counts are manageable (hundreds, not millions).

## jsPDF for client-side exports
PDF generation runs entirely in the browser using jsPDF. No server-side dependency. Embeds receipt images directly. Tradeoff: large exports with many images can be slow.

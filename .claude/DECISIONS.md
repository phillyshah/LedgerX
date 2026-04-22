# Design Decisions

## Username-based auth with optional real email
Privacy-first: members don't need to share emails. Auth uses `username@ledgerx.local` internally. Login via `get_user_email_by_username()` RPC → `COALESCE(real_email, email)`. Optional real email (UserSettings → `update-user-email` edge fn) unlocks password reset.

## Households as multi-tenant boundary
Each household is isolated: expenses, members, categories. Maps to personal spending, shared house, rental, business account. RLS enforces isolation at DB level.

## Categories stored as text (not FK)
`expenses.category` is plain text matching `categories.name`. OCR writes directly without ID lookup. Simpler queries, no joins. Tradeoff: renaming a category doesn't cascade.

## OpenAI gpt-4o-mini for receipt OCR
Primary model `gpt-4o-mini`, fallback `gpt-4o`. Uses `detail: "low"` (512px internal downscale); client compresses ~300KB/800px. JSON mode guarantees valid output.

## Client-side filtering
All user expenses loaded in one query via `useExpenses`. Search/filter via `useMemo` — instant UX, no round-trips. Works because per-household counts are hundreds, not millions.

## jsPDF for client-side exports
PDF generation in-browser. No server dependency. Embeds receipt images. Tradeoff: large exports with many images can be slow.

## SpendingCharts in both Dashboard and AdminAnalytics
Admins route directly to AdminLayout (never see Dashboard), so the chart component must be wired into both views.

## Hostinger VPS for hosting
Static `dist/` served by nginx at `72.62.174.193`. DNS via Hostinger. Bolt no longer used.

## i18n: flat-key dictionaries via useT()
Two flat JSON dictionaries (`en.json`, `pt-BR.json`). `useT()` reads `preferredLanguage` from AuthContext — no React Context of its own, no heavy i18n library. `t(key, params?)` supports `{param}` interpolation and falls back to English → raw key. `locale` string (e.g. `'pt-BR'`) passed to `Intl` directly — no separate locale context needed.

## Contractor role: stripped-down UI
Contractors submit receipts only. Dashboard branches on `isContractor` — hides charts, summary cards, Export, Reports. Shows prominent Add Transaction + own-submissions list. Enforced in frontend only (DB RLS doesn't distinguish contractors from regular users). Contractors cannot be admins.

## Submitter attribution via join
`expenses.created_by` FK → `user_profiles`. `useExpenses` joins via `user_profiles!expenses_created_by_fkey` and maps to `submitter_username`. ExpenseList renders `@username` chip. No extra query — comes with the main expense fetch.

## HelpModal: role-gated, language-aware markdown
`HelpModal` picks `README.md` (en) or `README.pt-BR.md` (pt-BR). Sections tagged with `<!-- roles: admin -->` are stripped for non-admin users. Keeps a single source of truth per language rather than separate admin/user help files.

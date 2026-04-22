# Common Mistakes

## 1. Date off-by-one (UTC bug)

**NEVER** `new Date("2026-03-15")` — JS parses as UTC midnight, shifts to previous day in US timezones.

```typescript
// ✅ correct
const [year, month, day] = dateString.split('-').map(Number);
const date = new Date(year, month - 1, day);
```

Fixed twice (commits c59f2bf, f0f3d28). Will recur if you use `new Date(string)` with a date string.

## 2. RLS infinite recursion

Policies that query `household_members` inside a policy on `household_members` recurse infinitely. Always use the `user_households()` SQL helper instead of inline subqueries.

See migration `20260202000835_fix_rls_infinite_recursion.sql`.

## 3. Legacy image dual-write

`expenses` table has `image_path`, `image_mime`, `image_width`, `image_height` for backward compat. `expense_images` is the source of truth for multi-image.

**Always write to both** — legacy fields get the primary (first) image; all images go into `expense_images` with `display_order`.

## 4. Vendor-category lookups are case-insensitive

`vendor_category_map` uses `ilike`, not `eq`. Index is on `lower(vendor_name)`. Always use `ilike`.

## 5. Edge functions with ES256 JWTs — deploy with --no-verify-jwt

This project uses ES256 (asymmetric JWT signing). The edge runtime's built-in pre-verifier only supports HS256 → rejects ES256 with `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`.

**Fix**: deploy with `--no-verify-jwt`; verify auth inside via `supabase.auth.getUser(token)` (Gotrue handles ES256 natively). `config.toml` already sets `verify_jwt = false` for `update-user-email`. Apply to all new auth-dependent functions.

## 6. Admin role assignment

`claim_admin_role()` removed in migration `20260419000001`. Roles assigned only via `admin_update_user_role()` RPC or `admin-create-user` edge function.

## 7. i18n — never hardcode strings or locale

**NEVER** add a new user-visible string as a raw literal. **NEVER** hardcode `'en-US'`.

```typescript
// ❌ wrong
<p>No transactions yet</p>
new Intl.NumberFormat('en-US', ...)

// ✅ correct
<p>{t('expenses.noneYet')}</p>
new Intl.NumberFormat(locale, ...)
```

Always add the key to **both** `src/i18n/en.json` AND `src/i18n/pt-BR.json` in the same commit. Missing pt-BR key falls back to English silently — it won't crash, but it will show English to Portuguese users.

## 8. Help docs — update both READMEs

`HelpModal` renders `README.md` for English users and `README.pt-BR.md` for Portuguese users. If you add a feature and only update `README.md`, Portuguese users see stale help content.

**Rule**: any user-visible feature or change → update both files before committing.

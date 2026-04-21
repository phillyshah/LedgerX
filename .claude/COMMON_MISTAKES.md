# Common Mistakes

## 1. Date off-by-one (UTC bug)

**NEVER** do `new Date("2026-03-15")` — JavaScript parses this as UTC midnight, which shifts to the previous day in US timezones.

**DO** this instead:
```typescript
const [year, month, day] = dateString.split('-').map(Number);
const date = new Date(year, month - 1, day);
```

This bug was fixed twice (commits c59f2bf, f0f3d28). It will come back if you use `new Date()` with a date string anywhere.

## 2. RLS infinite recursion

Supabase RLS policies that query `household_members` inside a policy on `household_members` cause infinite recursion. Always use the `user_households()` SQL helper function instead of inline subqueries.

See migration `20260202000835_fix_rls_infinite_recursion.sql` for the fix.

## 3. Legacy image dual-write

The `expenses` table has `image_path`, `image_mime`, `image_width`, `image_height` columns for backward compatibility. The `expense_images` table is the source of truth for multiple images.

**Always write to both** — update the legacy fields with the primary (first) image, and insert all images into `expense_images` with `display_order`.

## 4. Vendor-category lookups are case-insensitive

The `vendor_category_map` table uses `ilike` for lookups, not `eq`. The index is on `lower(vendor_name)`. Always use `ilike` when querying this table.

## 5. Edge functions with ES256 JWTs — use --no-verify-jwt

This Supabase project uses ES256 (asymmetric JWT signing). The edge function runtime's built-in JWT pre-verifier only supports HS256 and will reject ES256 tokens with `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM` before the function code runs.

**Fix**: deploy affected functions with `--no-verify-jwt` flag and verify auth inside the function code via `supabase.auth.getUser(token)` (which hits the Gotrue endpoint and handles ES256 natively).

`supabase/config.toml` already sets `verify_jwt = false` for `update-user-email`. Apply the same pattern to any new edge function that authenticates users.

## 6. Admin role assignment

`claim_admin_role()` was removed in migration `20260419000001`. Admin roles are assigned only via `admin_update_user_role()` RPC or the `admin-create-user` edge function.

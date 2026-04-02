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

## 4. Receipt OCR JSON parsing

Claude may wrap its JSON response in markdown fences. The `extract-receipt` edge function strips these with:
```typescript
content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
```
Keep this cleanup if modifying the parser.

## 5. Vendor-category lookups are case-insensitive

The `vendor_category_map` table uses `ilike` for lookups, not `eq`. The index is on `lower(vendor_name)`. Always use `ilike` when querying this table.

## 6. Hardcoded admin claim code (SECURITY)

`claim_admin_role()` in migration `20260207140550` accepts the code `'ledgerx-admin-2024'`. This function is still active in the database. The `admin-create-user` edge function is the preferred way to create admins, but anyone who knows this code can grant themselves admin access. Consider rotating or removing this function.

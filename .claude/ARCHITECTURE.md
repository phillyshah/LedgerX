# Architecture

## Directory Structure

```
src/
├── App.tsx                    # Routes: AuthForm → ResetPasswordForm → Dashboard or AdminLayout
├── version.ts                 # Single source of truth: APP_VERSION = 'v4.3'
├── contexts/AuthContext.tsx   # isAdmin, isContractor, preferredLanguage, setPreferredLanguage
├── hooks/
│   ├── useExpenses.ts         # Shared expense fetching; joins user_profiles for submitter_username
│   └── useT.ts                # i18n hook — returns { t(key, params?), locale }
├── i18n/
│   ├── en.json                # Flat-key English dictionary
│   ├── pt-BR.json             # Flat-key Brazilian Portuguese dictionary
│   └── index.ts               # dictionaries, Language type, localeMap
├── types/expense.ts           # Includes submitter_username?: string
├── lib/
│   ├── supabase.ts
│   ├── database.types.ts
│   ├── receiptScanner.ts      # OCR client + formatReceiptNotes
│   └── imageCompression.ts    # Canvas-based JPEG compression
└── components/
    ├── Dashboard.tsx           # Branches on isContractor; both branches include Help + version header
    ├── DashboardSummary.tsx    # 4 summary cards; locale-aware Intl formatting
    ├── SpendingCharts.tsx      # Monthly area + category pie (recharts)
    ├── ExpenseList.tsx         # Tx list, client-side filter/search; submitter @chip
    ├── AddExpense.tsx          # Create modal w/ receipt scan
    ├── EditExpense.tsx         # Edit modal w/ image management
    ├── Reports.tsx             # PDF/CSV report builder
    ├── ExportData.tsx
    ├── AuthForm.tsx            # Login + signup (language picker) + forgot-password
    ├── ResetPasswordForm.tsx
    ├── UserSettings.tsx        # Email, password, preferred language self-service
    ├── HelpModal.tsx           # Renders README.md or README.pt-BR.md; role-filtered sections
    └── admin/
        ├── AdminLayout.tsx     # Sidebar + Help/version; uses useT for nav labels
        ├── AdminAnalytics.tsx
        ├── ManageHouseholds.tsx
        ├── ManageCategories.tsx
        ├── ManageUsers.tsx     # Role select (Regular/Admin/Contractor) + Language select
        └── UncategorizedTransactions.tsx
supabase/
├── config.toml                 # verify_jwt=false for update-user-email
├── migrations/                 # SQL migrations (RLS, schema, functions)
└── functions/                  # All auth-dependent fns deployed --no-verify-jwt (ES256)
    ├── extract-receipt/
    ├── update-user-email/
    ├── admin-create-user/
    ├── admin-delete-user/
    └── admin-change-password/
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `households` | Tenant containers |
| `household_members` | User ↔ household (role: owner/member) |
| `expenses` | Core transaction data (`created_by` → user_profiles FK) |
| `expense_images` | Multiple receipts per expense (`display_order`) |
| `categories` | Global if `household_id` NULL |
| `category_households` | M2M: categories ↔ households |
| `vendor_category_map` | Auto-fill: vendor → category per household |
| `user_roles` | `is_admin`, `is_contractor` flags |
| `user_profiles` | username, real_email (nullable), `preferred_language` ('en'\|'pt-BR') |
| `exports` | Export request tracking |

## Data Flow

1. `AuthContext` → reads `user_roles` + `user_profiles` → exposes `isAdmin`, `isContractor`, `preferredLanguage`
2. `useT()` reads `preferredLanguage` from AuthContext → returns `t(key)` and `locale` string for Intl
3. `Dashboard` branches on `isContractor`: contractor sees only Add + own submissions list
4. `useExpenses` joins `user_profiles` for `submitter_username`; `ExpenseList` shows `@chip`
5. `AddExpense` uploads images → `extract-receipt` → auto-populates form
6. Vendor-category map: upsert on save, lookup on add

## i18n Layer

- **Hook**: `useT()` at `src/hooks/useT.ts` — reads `preferredLanguage` from AuthContext, returns `{ t, locale }`
- **`t(key, params?)`**: looks up flat key in active dictionary; falls back to English; falls back to raw key (no crash)
- **Interpolation**: `{param}` syntax — e.g. `t('summary.vsLastMonth', { pct: 12 })`
- **`locale`**: `'en-US'` or `'pt-BR'` — use in every `Intl.NumberFormat` / `toLocaleDateString` call
- **Dictionaries**: `src/i18n/en.json` + `pt-BR.json` — flat keys, namespace-prefixed (`addExpense.title`)
- **Help docs**: `README.md` (en) + `README.pt-BR.md` (pt-BR) — `HelpModal` picks based on `preferredLanguage`; role-gated sections via `<!-- roles: admin -->` HTML comments

## Key Patterns

- **RLS helpers**: `user_households()` and `user_owned_households()` SQL functions prevent infinite recursion
- **Category loading**: query `category_households` + global (`household_id IS NULL`), merge & dedupe
- **Image dual-write**: first image → `expenses` legacy fields AND all images → `expense_images`
- **OCR pipeline**: client compresses ~300KB/800px → edge fn calls OpenAI `gpt-4o-mini` (`detail: "low"`, JSON mode)
- **Optional real email**: UserSettings → `update-user-email` edge fn → `user_profiles.real_email` + `auth.users.email`; login uses `COALESCE(real_email, email)` RPC

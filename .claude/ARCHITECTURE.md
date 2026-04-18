# Architecture

## Directory Structure

```
src/
├── App.tsx                    # Routes: AuthForm → Dashboard or AdminLayout
├── contexts/AuthContext.tsx   # Auth state, signIn/signUp/signOut, isAdmin
├── hooks/useExpenses.ts       # Shared expense fetching for Dashboard
├── types/expense.ts
├── lib/
│   ├── supabase.ts
│   ├── database.types.ts
│   ├── receiptScanner.ts      # OCR client + formatReceiptNotes
│   └── imageCompression.ts    # Canvas-based JPEG compression
├── components/
│   ├── Dashboard.tsx           # Orchestrates data flow
│   ├── DashboardSummary.tsx    # 4 summary cards
│   ├── ExpenseList.tsx         # Tx list, client-side filter/search
│   ├── AddExpense.tsx          # Create modal w/ receipt scan
│   ├── EditExpense.tsx         # Edit modal w/ image management
│   ├── Reports.tsx             # PDF/CSV report builder
│   ├── ExportData.tsx
│   ├── AuthForm.tsx
│   ├── HelpModal.tsx
│   └── admin/
│       ├── AdminLayout.tsx
│       ├── AdminAnalytics.tsx
│       ├── ManageHouseholds.tsx
│       ├── ManageCategories.tsx
│       ├── ManageUsers.tsx
│       └── UncategorizedTransactions.tsx
supabase/
├── migrations/                 # 26 SQL migrations (RLS, schema, functions)
└── functions/
    ├── extract-receipt/        # OpenAI gpt-4o-mini OCR (gpt-4o fallback)
    ├── admin-create-user/
    ├── admin-delete-user/
    └── admin-change-password/
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `households` | Tenant containers |
| `household_members` | User ↔ household (role: owner/member) |
| `expenses` | Core transaction data (category is text, not FK) |
| `expense_images` | Multiple receipts per expense (`display_order`) |
| `categories` | Global if `household_id` is NULL |
| `category_households` | M2M: categories ↔ households |
| `vendor_category_map` | Auto-fill: vendor → category per household |
| `user_roles` | Admin flag |
| `user_profiles` | Username ↔ auth.users |
| `exports` | Export request tracking |

## Data Flow

1. `AuthContext` checks auth → routes to AuthForm/Dashboard/AdminLayout
2. `Dashboard` calls `useExpenses()` → passes data to DashboardSummary + ExpenseList
3. `ExpenseList` filters/searches client-side (no extra queries)
4. `AddExpense` uploads images → `extract-receipt` edge function → auto-populates form
5. Vendor-category map: upserts on save, looks up on add for auto-fill

## Key Patterns

- **RLS helpers**: `user_households()` and `user_owned_households()` SQL functions prevent infinite recursion
- **Category loading**: query `category_households` junction + global categories (`household_id IS NULL`), merge & dedupe
- **Image dual-write**: first image metadata to `expenses` (legacy) AND all images to `expense_images`
- **OCR pipeline**: client compresses to ~300KB/800px → edge function calls OpenAI with `detail: "low"` + JSON mode

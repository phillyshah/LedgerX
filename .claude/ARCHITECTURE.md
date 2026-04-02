# Architecture

## Directory Structure

```
src/
├── App.tsx                    # Routes: AuthForm → Dashboard (user) or AdminLayout (admin)
├── contexts/AuthContext.tsx   # Auth state, signIn/signUp/signOut, isAdmin check
├── hooks/useExpenses.ts       # Shared expense data fetching for Dashboard
├── types/expense.ts           # Shared Expense and Household interfaces
├── lib/
│   ├── supabase.ts            # Supabase client instance
│   ├── database.types.ts      # Generated Supabase types
│   ├── receiptScanner.ts      # OCR interface + formatReceiptNotes helper
│   └── imageCompression.ts    # Client-side image compression (2MB max)
├── components/
│   ├── Dashboard.tsx           # Main user screen, orchestrates data flow
│   ├── DashboardSummary.tsx    # 4 summary cards (month totals, top category, tx count)
│   ├── ExpenseList.tsx         # Transaction list with search + filters (receives props)
│   ├── AddExpense.tsx          # Create expense modal with receipt scan
│   ├── EditExpense.tsx         # Edit expense modal with image management
│   ├── Reports.tsx             # Report builder with PDF/CSV export
│   ├── ExportData.tsx          # Data export with sorting options
│   ├── AuthForm.tsx            # Login/signup (username-based)
│   └── HelpModal.tsx           # User help guide
│   └── admin/
│       ├── AdminLayout.tsx     # Admin panel with tab navigation
│       ├── AdminAnalytics.tsx  # Spending charts + category breakdown
│       ├── ManageHouseholds.tsx
│       ├── ManageCategories.tsx
│       ├── ManageUsers.tsx
│       └── UncategorizedTransactions.tsx
supabase/
├── migrations/                 # 26 SQL migrations (RLS, schema, functions)
└── functions/                  # Edge functions (Deno)
    ├── extract-receipt/        # Claude Haiku OCR for receipt scanning
    ├── admin-create-user/
    ├── admin-delete-user/
    └── admin-change-password/
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `households` | Tenant containers for expenses |
| `household_members` | User ↔ household (role: owner/member) |
| `expenses` | Core transaction data |
| `expense_images` | Multiple receipt images per expense (display_order) |
| `categories` | Expense categories (global if household_id is NULL) |
| `category_households` | Many-to-many: categories ↔ households |
| `vendor_category_map` | Auto-fill: vendor → category per household |
| `user_roles` | Admin flag per user |
| `user_profiles` | Username mapping (username ↔ auth.users) |
| `exports` | Export request tracking (queued/running/completed/failed) |

## Data Flow

1. `AuthContext` checks auth state → routes to `AuthForm`, `Dashboard`, or `AdminLayout`
2. `Dashboard` calls `useExpenses()` hook → passes data to `DashboardSummary` + `ExpenseList`
3. `ExpenseList` does client-side filtering/search (no extra queries)
4. `AddExpense` uploads images → calls `extract-receipt` edge function → auto-populates form
5. Vendor-category mapping: on save, upserts to `vendor_category_map`; on add, looks up for auto-fill

## Key Patterns

- **RLS helper functions**: `user_households()` and `user_owned_households()` prevent infinite recursion in policies
- **Category loading**: Query `category_households` junction table + global categories (where `household_id IS NULL`), merge and deduplicate
- **Image dual-write**: First image metadata goes on `expenses` table (legacy) AND all images go to `expense_images` table

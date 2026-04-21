# LedgerX

A secure, shared expense tracker for households and teams. Log spending, scan receipts, run reports, and stay on the same page — all from one clean interface.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Signing In](#signing-in)
- [Dashboard Overview](#dashboard-overview)
- [Adding a Transaction](#adding-a-transaction)
- [Receipt Scanning & OCR](#receipt-scanning--ocr)
- [Viewing Editing & Searching Transactions](#viewing-editing--searching-transactions)
- [Uploading Receipts](#uploading-receipts)
- [Spending Charts](#spending-charts)
- [Exporting Your Data](#exporting-your-data)
- [Reports](#reports)
- [Account Settings](#account-settings)
- [Managing Households](#managing-households)
- [Admin Features](#admin-features)
- [FAQ & Troubleshooting](#faq--troubleshooting)
- [Tech Stack](#tech-stack)
- [Developer Setup](#developer-setup)

---

## Getting Started

LedgerX is built for households and small teams that want a shared, organized way to track expenses. Whether you're splitting costs with roommates, logging business receipts, or managing a family budget, LedgerX keeps everything in one place.

**What you can do:**

- Log expenses with vendor, amount, date, category, and notes
- Scan receipts with OCR — fields fill in automatically
- Attach multiple receipt photos or PDFs to any transaction
- See spending summaries and charts right on your dashboard
- Export data as CSV or PDF with receipt images embedded
- Belong to multiple households and track each one separately
- Admins can manage users, households, and categories

---

## Signing In

1. Open the app at **ledger.phillyshah.com** in your browser.
2. Enter your **username** and **password**.
3. Click **Sign In**.

> **Note:** LedgerX uses username-based login — no email required to sign in. If you don't have an account yet, ask your admin to create one for you.

**Forgot your password?**

If you've added an email to your account (in Settings), click **Forgot password?** on the login screen and a reset link will be emailed to you. If you haven't set an email yet, ask your admin to reset it.

---

## Dashboard Overview

After signing in you'll land on your **Dashboard** — your home base.

### Summary Cards

Four cards at the top give you an at-a-glance spending snapshot:

| Card | What it shows |
|---|---|
| **Today** | Total spent today |
| **This Week** | Total spent in the last 7 days |
| **This Month** | Total spent in the current calendar month |
| **Transactions** | Total number of transactions recorded |

### Quick Actions

| Button | What it does |
|---|---|
| **Add Transaction** | Opens the form to log a new expense |
| **Export Data** | Download your transactions as CSV or PDF |
| **Reports** | View filtered spending reports |

If you belong to multiple households, use the **household selector** to switch between them. Everything — transactions, exports, charts — is scoped to the selected household.

---

## Adding a Transaction

1. Tap **Add Transaction** from the Dashboard.
2. Fill in the details:
   - **Household** — Which household this expense belongs to
   - **Date** — When the purchase was made
   - **Amount** — Total cost
   - **Vendor** — Store name, restaurant, etc.
   - **Category** — Choose from your household's categories
   - **Notes** — Any extra details (optional)
   - **Receipt** — Attach a photo or PDF (optional)
3. Click **Save**.

**Tip:** If you've logged a purchase from the same vendor before, the category may auto-fill based on your history.

---

## Receipt Scanning & OCR

LedgerX can read your receipt and fill in the form automatically.

### How it works

1. When adding a transaction, attach a receipt image (JPG, PNG, or PDF).
2. The app scans the first receipt automatically and extracts:
   - Vendor name
   - Total amount
   - Date
   - Category
   - Tax, tip, payment method, and itemized summary (when visible)
3. Review the auto-filled fields and adjust anything the scan missed.

### Tips for best results

- **Good lighting** makes a big difference — avoid glare and shadows.
- **Flat receipts** scan better than crumpled ones.
- **Thermal paper fades** — scan or photograph soon after purchase.
- The scan runs on the **first attached file only**. Add additional receipts after.

---

## Viewing Editing & Searching Transactions

The **Expense List** shows all transactions for your selected household, newest first.

### Search

Type in the **search bar** to filter by vendor, category, notes, or household name in real time.

### Filters & Sorting

Use the filter controls to narrow by:
- **Category** — Show only one type of expense
- **Sort** — Switch between newest-first, oldest-first, highest amount, lowest amount

### Editing a transaction

1. Click any transaction in the list.
2. Update fields as needed.
3. Click **Save**.

### Deleting a transaction

1. Click the transaction.
2. Click **Delete** and confirm.

> Deletions are permanent — receipt images are also removed.

---

## Uploading Receipts

You can attach receipts when adding or editing any transaction.

- **Supported formats:** JPG, PNG, WebP, **PDF**
- **Multiple files:** Attach as many receipts as you need — useful for itemized orders, multi-page invoices, or corrected receipts.
- **Compression:** Images are automatically compressed before upload so you can use phone photos directly.
- **PDF receipts:** Show as a document icon in the thumbnail grid. Click to open the PDF in a new tab.
- **Image receipts:** Click any thumbnail to open a full-size view with zoom controls (+ / −).
- **Primary receipt:** The first file attached is the primary. It appears in exports and reports.

---

## Spending Charts

Your dashboard includes two charts that update automatically as you add transactions:

- **Monthly Spending** — An area chart showing your spending total for each of the last 6 months.
- **Spending by Category** — A pie chart breaking down where your money is going across all categories.

Charts respond to your **household selection** — switch households at the top to see that household's data.

---

## Exporting Your Data

Download your expense data in two formats from **Export Data** on the Dashboard.

### CSV Export

- Spreadsheet-compatible file with all transaction fields.
- Great for Excel, Google Sheets, or accounting software.

### PDF Export

- Formatted document with transaction details and embedded receipt images.
- Up to 6 receipt images per transaction are embedded.
- Ideal for printing, archiving, or sharing with an accountant.

**To export:**
1. Click **Export Data** from the Dashboard.
2. Select your household, date range, and optional category filter.
3. Choose CSV or PDF.
4. Your file downloads automatically.

---

## Reports

**Reports** let you analyze spending with flexible filters:

- **Household** — Scope to one household
- **Category** — Filter by expense type
- **Date Range** — Set a custom start and end date

Reports show a breakdown of matching transactions so you can spot trends and stay on budget.

---

## Account Settings

Access **Settings** from the menu on your Dashboard.

### Add or Update Email

Adding an email to your account unlocks **self-service password reset** — so you can recover access without contacting an admin.

1. Open Settings.
2. Enter your email address under **Add Email**.
3. Click **Add Email** to save.

### Change Password

1. Open Settings.
2. Enter your new password under **Change Password**.
3. Click **Change Password** to save.

---

## Managing Households

LedgerX supports **multiple households** per user — useful if you:

- Track personal expenses separately from shared costs
- Manage budgets for different properties or groups

Your admin can add you to additional households. Each household has its own transactions, categories, and members.

**Household roles:**

| Role | Permissions |
|---|---|
| **Owner** | Full control — manage members, settings, and deletion |
| **Member** | Add, view, edit, and delete transactions |

---

## Admin Features

Admin accounts see an **Admin Panel** instead of the regular Dashboard.

### Analytics

- Total spending and transaction count across all households
- Spending breakdown by category with charts
- Filterable by date range and household
- Export any view as CSV or PDF

### Manage Households

- Create new households
- Add or remove members
- View all households on the platform

### Manage Users

- Create new user accounts
- Reset passwords for any user
- Grant or revoke admin privileges
- Assign users to households

### Manage Categories

- Create, edit, and delete categories
- Scope categories to a specific household or make them global
- Each household only sees categories assigned to it

### Uncategorized Transactions

- Review all transactions missing a category
- Assign categories in bulk from one view

---

## FAQ & Troubleshooting

**Q: I forgot my password and can't log in.**
A: If you've added an email to your account, use **Forgot password?** on the login screen. Otherwise, ask your admin to reset it from Admin → Manage Users.

**Q: I want to add an email so I can reset my own password.**
A: Sign in, open **Settings**, and enter your email under Add Email.

**Q: I can't see a household I should have access to.**
A: Your admin needs to add you as a member of that household.

**Q: My receipt photo or PDF won't upload.**
A: Supported formats are JPG, PNG, WebP, and PDF. Very large files may time out — try a slightly lower-resolution photo. PDFs that are password-protected cannot be uploaded.

**Q: The OCR scan filled in the wrong details.**
A: Just correct the fields manually before saving. OCR is a best-effort read — poor lighting, faded ink, or unusual receipt layouts can throw it off.

**Q: I accidentally deleted a transaction.**
A: Deletions are permanent. There is no undo — double-check before confirming.

**Q: My export is missing transactions.**
A: Check that you selected the correct household and date range. Transactions outside the range won't appear.

**Q: How do I become an admin?**
A: An existing admin must grant you admin privileges from Admin → Manage Users.

**Q: Can I belong to more than one household?**
A: Yes. An admin can add you to multiple households. Use the household selector on the Dashboard to switch between them.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS |
| Build Tool | Vite |
| Backend & Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (username/password) |
| File Storage | Supabase Storage (private bucket) |
| OCR | OpenAI gpt-4o-mini vision |
| PDF Generation | jsPDF |
| Charts | Recharts |
| Icons | Lucide React |
| Hosting | Hostinger VPS + nginx |
| Security | Row Level Security (RLS) on all tables |

---

## Developer Setup

### Prerequisites

- Node.js v18+
- Supabase project ([supabase.com](https://supabase.com))

### Installation

```bash
git clone https://github.com/phillyshah/LedgerX.git
cd LedgerX
npm install
```

### Environment Variables

Create `.env` in the project root:

```
VITE_SUPABASE_URL=https://bkxccrbfjoqtxbtekrgw.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Supabase

```bash
supabase link --project-ref bkxccrbfjoqtxbtekrgw
supabase db push
supabase functions deploy extract-receipt
supabase functions deploy update-user-email --no-verify-jwt
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase functions deploy admin-change-password
```

### Dev Server

```bash
npm run dev
npm run build
npm run typecheck
```

### Deploy to Hostinger

```bash
npm run build
rsync -avz --delete dist/ root@72.62.174.193:/var/www/ledger.phillyshah.com/
```

---

## License

Proprietary. All rights reserved.

# LedgerX

A secure, shared household expense management app. Track spending, upload receipts, manage multiple households, and export your data — all from one clean interface.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Signing In](#signing-in)
- [Dashboard Overview](#dashboard-overview)
- [Adding a Transaction](#adding-a-transaction)
- [Viewing & Editing Transactions](#viewing--editing-transactions)
- [Uploading Receipts](#uploading-receipts)
- [Exporting Your Data](#exporting-your-data)
- [Reports](#reports)
- [Managing Households](#managing-households)
- [Admin Features](#admin-features)
- [FAQ & Troubleshooting](#faq--troubleshooting)
- [Tech Stack](#tech-stack)
- [Developer Setup](#developer-setup)

---

## Getting Started

LedgerX is designed for households that want a simple, shared way to track expenses. Whether you're splitting costs with roommates or managing a family budget, LedgerX keeps everything organized and secure.

**What you can do:**

- Log expenses with vendor, amount, date, category, and notes
- Attach receipt photos to any transaction
- Belong to one or more households and track expenses for each
- Export your data as CSV or PDF (with receipt images embedded)
- Run reports filtered by date range, category, or household
- Admins can manage users, households, and categories from a dedicated panel

---

## Signing In

1. Open the app in your browser.
2. Enter the **username** and **password** provided by your household admin.
3. Click **Sign In**.

> **Note:** LedgerX uses username-based login. You do not need an email address to sign in. If you don't have an account, ask your household admin to create one for you.

---

## Dashboard Overview

After signing in, you'll land on the **Dashboard**. This is your home base with quick-access buttons:

| Button | What it does |
|---|---|
| **Add Transaction** | Opens the form to log a new expense |
| **Export Data** | Download your transactions as CSV or PDF |
| **Reports** | View spending reports with filters |

If you belong to multiple households, use the **household selector** at the top to switch between them. All transactions, exports, and reports are scoped to the selected household.

---

## Adding a Transaction

1. From the Dashboard, tap **Add Transaction**.
2. Fill in the details:
   - **Household** — Select which household this expense belongs to
   - **Date** — When the purchase was made
   - **Amount** — The total cost
   - **Vendor** — Where you made the purchase (store name, restaurant, etc.)
   - **Category** — Choose from the available categories (e.g., Groceries, Utilities, Dining)
   - **Notes** — Any additional details (optional)
   - **Receipt** — Upload a photo of the receipt (optional)
3. Click **Save** to record the transaction.

---

## Viewing & Editing Transactions

The **Expense List** shows all transactions for your selected household, sorted by date (newest first).

**Filtering:** Use the household filter to narrow results.

**Editing a transaction:**
1. Click on any transaction in the list.
2. Update the fields you want to change.
3. Click **Save** to apply your changes.

**Deleting a transaction:**
1. Click on the transaction.
2. Click the **Delete** button.
3. Confirm the deletion.

> Deleted transactions and their associated receipt images are permanently removed.

---

## Uploading Receipts

You can attach a receipt photo when adding or editing a transaction.

- **Supported formats:** PNG, JPG, WebP
- **Size limit:** Images are automatically compressed to a maximum of 2 MB, so you can upload photos directly from your phone camera without worrying about file size.
- **Viewing:** Click on any receipt thumbnail in the transaction list to open a full-size view with zoom controls.

---

## Exporting Your Data

LedgerX lets you download your expense data in two formats:

### CSV Export
- Generates a spreadsheet-compatible file with all transaction details.
- Great for importing into Excel, Google Sheets, or accounting software.

### PDF Export
- Creates a formatted document with transaction details **and embedded receipt images**.
- Lays out up to 4 transactions per page with receipts displayed alongside each entry.
- Ideal for printing, archiving, or sharing with accountants.

**To export:**
1. From the Dashboard, click **Export Data**.
2. Select your household and date range.
3. Choose CSV or PDF.
4. Your file will download automatically.

---

## Reports

The **Reports** section lets you analyze your spending with flexible filters:

- **Household** — View spending for a specific household
- **Category** — Filter by expense category
- **Date Range** — Set a custom start and end date

Reports show a breakdown of your transactions matching the selected filters, helping you spot trends and stay on budget.

---

## Managing Households

LedgerX supports **multiple households** per user. This is useful if you:
- Track personal expenses separately from shared household costs
- Manage budgets for different properties or groups

Your household admin can add you to additional households. Each household has its own set of transactions, categories, and members.

**Household roles:**
| Role | Permissions |
|---|---|
| **Owner** | Full control — manage members, edit household settings, delete the household |
| **Member** | Add, view, edit, and delete transactions within the household |

---

## Admin Features

If your account has **admin** privileges, you'll see an **Admin Panel** with additional tools:

### Analytics Dashboard
- Total spending across the platform
- Transaction count
- Spending breakdown by category (with charts)
- Filterable by date range and household

### Manage Households
- Create new households
- Add or remove members from any household
- View all households on the platform

### Manage Users
- Create new user accounts
- Reset passwords for existing users
- Grant or revoke admin privileges
- Assign users to households

### Manage Categories
- Create new expense categories
- Edit or delete existing categories
- Assign categories to specific households or make them available globally
- Categories can be scoped to individual households so each group only sees relevant options

---

## FAQ & Troubleshooting

**Q: I forgot my password.**
A: Ask your household admin to reset it from the Admin Panel under Manage Users.

**Q: I can't see a household I should have access to.**
A: Your admin needs to add you as a member of that household. Contact them to be added.

**Q: My receipt photo won't upload.**
A: Make sure the image is a PNG, JPG, or WebP file. The app automatically compresses large images, but extremely corrupted files may fail. Try taking a new photo.

**Q: I accidentally deleted a transaction.**
A: Unfortunately, deletions are permanent. Double-check before confirming a delete.

**Q: My export is missing transactions.**
A: Verify that you selected the correct household and date range. Transactions outside the selected range won't be included.

**Q: How do I become an admin?**
A: An existing admin must grant you admin privileges from the Manage Users page.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS |
| Build Tool | Vite |
| Backend & Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (username/password) |
| File Storage | Supabase Storage (private bucket) |
| PDF Generation | jsPDF |
| Icons | Lucide React |
| Security | Row Level Security (RLS) on all tables |

---

## Developer Setup

### Prerequisites
- Node.js (v18 or later recommended)
- A Supabase project ([create one free at supabase.com](https://supabase.com))

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd LedgerX

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

You can find these values in your Supabase project dashboard under **Settings > API**.

### Database Setup

See [SETUP.md](./SETUP.md) for the complete SQL schema, RLS policies, and storage bucket configuration.

### Running the App

```bash
# Start the development server
npm run dev

# Type-check the project
npm run typecheck

# Lint the codebase
npm run lint

# Build for production
npm run build

# Preview the production build
npm run preview
```

---

## License

This project is proprietary. All rights reserved.

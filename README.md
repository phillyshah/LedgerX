# LedgerX

A secure, shared expense tracker for households and teams. Log spending, scan receipts, run reports, and stay on the same page — all from one clean interface.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Signing In](#signing-in)
- [Dashboard Overview](#dashboard-overview)
- [Adding a Transaction](#adding-a-transaction)
- [Receipt Scanning & OCR](#receipt-scanning--ocr)
- [Email Inbox (Forward Receipts by Email)](#email-inbox-forward-receipts-by-email)
- [WhatsApp (Text LedgerX)](#whatsapp-text-ledgerx)
- [Viewing Editing & Searching Transactions](#viewing-editing--searching-transactions)
- [Uploading Receipts](#uploading-receipts)
- [Spending Charts](#spending-charts)
- [Exporting Your Data](#exporting-your-data)
- [Reports](#reports)
- [Surgeon NPI Lookup](#surgeon-npi-lookup)
- [LedgerX Labs](#ledgerx-labs)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Account Settings](#account-settings)
- [Managing Households](#managing-households)
- [Admin Features](#admin-features)
- [Household Admin Role](#household-admin-role)
- [Contractor Role](#contractor-role)
- [FAQ & Troubleshooting](#faq--troubleshooting)
- [Tech Stack](#tech-stack)
- [Developer Setup](#developer-setup)

---

## Getting Started
<!-- roles: contractor, member, admin -->

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
<!-- roles: contractor, member, admin -->

1. Open the app at **ledger.90ten.life** in your browser.
2. Enter your **username** and **password**.
3. Click **Sign In**.

> **Note:** LedgerX uses username-based login — no email required to sign in. If you don't have an account yet, ask your admin to create one for you.

### First time here? Take the tour

The login screen has a **Take a quick tour** button that opens a 7-step walkthrough — receipt capture, email forwarding, organization, charts, and settings. The first time you visit the app it opens automatically, but you can launch it again any time, in English or Portuguese.

**Forgot your password?**

If you've added an email to your account (in Settings), click **Forgot password?** on the login screen and a reset link will be emailed to you. If you haven't set an email yet, ask your admin to reset it.

---

## Dashboard Overview
<!-- roles: member, admin -->

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

The **Add Transaction** button is the prominent green card at the top — that's the main thing you'll do every day. **Export Data** and **Reports** sit just below as small text links, since you'll only reach for them now and then.

| Action | What it does |
|---|---|
| **Add Transaction** | Opens the form to log a new expense |
| **Export Data** | Download your transactions as CSV or PDF |
| **Reports** | View filtered spending reports |

If you belong to multiple households, use the **household selector** to switch between them. Everything — transactions, exports, charts — is scoped to the selected household.

### Home button (the logo)

The **LedgerX logo** in the top-left corner is a **Home button** on every screen, desktop and mobile. Wherever you are — several levels deep in a report, a management screen, or an open form — tap the logo to jump straight back to your home screen (it closes any open panel and scrolls to the top). It's the quick way out if you ever feel stuck.

### Account menu (top-right avatar)

The header shows a single **avatar** icon on the right — a dropdown that contains **Settings**, **Help**, and **Sign out**, with the app version at the bottom. Tapping outside the menu (or pressing **Esc**) closes it. (The **What's New** link now lives in the footer at the bottom of the page — see below.)

### Collapsible Sections

The home screen leads with your main actions and your **Transactions** list. Spending summaries and charts are folded into a single **Insights** section that starts collapsed — open it when you want the numbers. Each major area (**Email Inbox**, **Transactions**, **Network Estimates**, **Insights**) has a small chevron (▾) next to its title. Tap the section title to collapse it; tap again to expand. Your choices stick on this device across reloads, so you can hide the parts you don't use day-to-day and keep the page tidy.

The **Estimates** and **Invoices** screens each carry their own **Submit** button, so you can start a new one without returning to the home page.

The **Email Inbox** section only appears when you have at least one forwarded item waiting to be reviewed.

---

## Adding a Transaction
<!-- roles: contractor, member, admin -->

1. Tap **Add Transaction** from the Dashboard.
2. Fill in the details:
   - **Household** — Which household this expense belongs to
   - **Date** — When the purchase was made
   - **Amount** — Total cost
   - **Vendor** — Store name, restaurant, etc.
   - **Category** — Choose from your household's categories
   - **Notes** — Any extra details (optional)
   - **Receipt** — Attach a photo or PDF (optional)
3. Click **Save receipt**.

**Logging several at once?** Tick **"Keep adding receipts after this one"** above the Save button. The form will reset and stay open so you can rip through a stack of receipts without reopening the dialog. Press **Esc** at any point to close.

**Tip:** If you've logged a purchase from the same vendor before, the category may auto-fill based on your history.

---

## Receipt Scanning & OCR
<!-- roles: contractor, member, admin -->

LedgerX can read your receipt and fill in the form automatically.

### How it works

1. When adding a transaction, attach a receipt image (JPG, PNG, or PDF).
2. The app scans the first receipt automatically and extracts:
   - Vendor name
   - Total amount
   - Date
   - Any handwritten notes on the receipt
3. Review the auto-filled fields and adjust anything the scan missed.

The receipt scanner deliberately stays focused on these four fields — it
won't try to itemize what was eaten or break out tax, tip, or payment
method. Category is auto-filled separately based on the vendor (see
**Vendor → Category mapping**), so you don't have to confirm a category
the OCR guessed. Invoices are different — uploading an invoice still
extracts the full set of invoice fields (number, service period, due
date, etc.).

### Tips for best results

- **Good lighting** makes a big difference — avoid glare and shadows.
- **Flat receipts** scan better than crumpled ones.
- **Thermal paper fades** — scan or photograph soon after purchase.
- The scan runs on the **first attached file only**. Add additional receipts after.
- **Date check**: if the form shows a date more than 90 days in the past after scanning, a yellow warning appears — OCR occasionally misreads the year (e.g. 2023 instead of 2026). Just correct the year and save.

---

## Templates (Save Once, Reuse Forever)
<!-- roles: contractor, member, admin -->

For recurring entries (rent, utilities, monthly retainers, weekly
cleaning), save a template once and reuse it in one click.

### Saving a template

1. On **Add Transaction** or **Submit Invoice**, fill the form as usual.
2. Tick **Save as template** at the bottom of the form and give it a
   name like "Monthly Rent" or "Comcast Internet".
3. Hit **Save** — the transaction saves *and* the template is stored.

### Using a template

1. Open **Add Transaction** or **Submit Invoice**.
2. The **Use a saved template** panel at the top of the form shows
   your saved templates as chips (only when you have at least one).
3. Tap a template — every applicable field pre-fills. Adjust whatever
   needs adjusting (date, amount drift) and save.

### Notes

- Templates are **private to your account** — they don't leak across
  household members. No "is this the right rent template this month?"
  arguments.
- For invoices, the **invoice number** is intentionally not stored on
  the template — every submission needs a fresh number.
- Delete a template with the trash icon next to its chip.

---

## Possible-Duplicate Warning
<!-- roles: contractor, member, admin -->

If you upload a receipt with the same vendor, total, and date (±1 day)
as one already in this household, an amber banner appears at the top
of the form. Same idea for invoices, matched by invoice number within
the property.

The warning is **non-blocking** — if you really do mean to submit
(say, two identical-amount lunches at the same restaurant on different
days, or a re-issue of an invoice with the same number), just save
anyway. It's a heads-up, not a wall.

---

## Vendor → Category Mapping (Vendor Catalog)
<!-- roles: contractor, member, admin -->

When you type a vendor name on **Add Transaction**, the field
autocompletes from a shared catalog. Two things populate that catalog:

1. **Auto-learned entries** — every time anyone in your household saves
   an expense with a vendor and category, the pair gets memoized for
   that household. Next time someone types the same vendor, the
   category snaps in.
2. **Admin-curated globals** — the platform admin can pre-load common
   vendors (Home Depot → Maintenance, Comcast → Utilities, etc.) that
   apply across every household. Globals fill the gap on day one,
   before a household has any history.

The household-specific entry always wins over the global if both exist.

**Admins** manage the catalog from **Manage Vendors** in the admin nav
— add new mappings, edit categories, delete bad entries, or **promote**
a household-specific entry to a global with one click. The page also
shows a search field and a scope filter (All / Global / Household).

---

## Email Inbox (Forward Receipts by Email)
<!-- roles: contractor, member, admin -->

You can email any receipt or invoice straight into LedgerX — no photo, no upload step. Forward it to **receipts@90ten.life** and it shows up on your Dashboard for review.

### One-time setup: Register your sender address

Before forwarded mail will appear in your inbox, you need to tell LedgerX which email addresses you'll be sending from. This is what links incoming mail to your account.

1. Open **Settings** from the avatar dropdown in the top-right of the Dashboard.
2. Scroll to **Email Forwarding**.
3. Type the email address you'll forward from (e.g. `you@gmail.com`), optionally label it ("Personal", "Work"), and click **Add address**.
4. Repeat for any other addresses you might forward from.

Mail from unregistered addresses is silently ignored — only addresses you've added land in your inbox.

### Forwarding a receipt or invoice

1. In your email client, find the receipt or invoice you want to log.
2. Forward it to **receipts@90ten.life**. Most email apps put any attachments through automatically. PDFs and image attachments are supported. **Receipts that come embedded in the email body itself** (Uber, airline confirmations, SaaS bills, and other vendors that don't attach a PDF) are also extracted automatically — the inbox card will show an **EMAIL** thumbnail you can click to view the original message.
3. Within ~5 minutes, a card appears in the **Email Inbox** section. Regular members and contractors see it on their Dashboard; admins and household admins see it on the **Admin home** view (alongside Quick Actions). Full admins also see a small **Inbound activity** diagnostic listing the last 20 forwards across all users — useful for confirming the pipeline is healthy even before your own inbox has rows.

### Reviewing & accepting

Each pending item is shown as a card with:

- The sender address and subject line
- Small pills showing what was auto-extracted (vendor, amount, date) so you can tell items apart at a glance
- Clickable thumbnails of any attachments (image or PDF — opens full-size in a new tab; HEIC files from iPhone forwards show a generic file tile that opens the original)
- A small **Review ▾** button on the right

Tap **Review ▾** and pick what kind of item it is:

| Choice | What happens |
|---|---|
| **Review as Receipt** | Opens **Add Transaction**, downloads the attachment, and runs OCR — vendor, amount, and date pre-fill themselves. |
| **Review as Invoice** | Opens **Submit Invoice** with the attachment and OCR'd vendor / amount / invoice number / date pre-filled. |

The form behaves exactly like a fresh upload from there — review the fields, tweak anything that's off, then **Save**. The attachment is re-uploaded under your household's normal path, so it's permanently associated with the resulting transaction or invoice.

After you save, a brief confirmation slides in at the bottom of the screen telling you the item now lives in **Recent Transactions** (or **Invoices**), and the card disappears from the **Email Inbox**. The pending count at the top of the section updates immediately, so you always see exactly how many cards still need attention.

If you don't want to keep something, tap the **×** in the top-right of the inbox card to discard it. The pending count drops by one as soon as you do. If you change your mind later, just forward the same email again — discarded items don't block re-forwards.

> **PDF tip:** OCR works on both images and PDFs (we rasterize the first page of the PDF before extracting). If a PDF can't be read, the form still opens with the file attached — just type the values in by hand.

---

## WhatsApp (Text LedgerX)
<!-- roles: contractor, member, admin -->

LedgerX has a WhatsApp number you can text like a person. Once your phone is linked, you can file receipts, invoices, and estimates, attach photos to existing ones, and pull quick reports — all from a chat.

### One-time setup

1. **An admin links your phone.** Numbers are managed in **Manage Users → WhatsApp** (admins only) and must be entered in international format exactly as WhatsApp reports it (e.g. `+14155551234`, `+5511998765432`). Messages from unlinked numbers are politely declined.
2. **Pick your notification channel.** In **Settings → WhatsApp**, choose where notifications go: **Email**, **WhatsApp**, or **Both**. (Receipt-related admin emails always go by email — receipts don't generate WhatsApp notices.)
3. **While we're on the Twilio sandbox:** you'll need to join the sandbox first (text the join code the admin gives you), and business-initiated notifications only arrive within 24 hours of your last message to the bot. Texting it occasionally keeps the channel open. A production number removes both limits.

### What you can text

- **Send a photo of a receipt or invoice** — the bot reads the vendor, amount, and date, asks anything it's missing (like which property), then shows a summary. **Nothing is saved until you reply YES.**
- **Or just describe it**: "add a $120 plumbing invoice for Oak House", "R$45 de mercado no Extra para Casa Lima", "new estimate for the deck repair at Miami House" (estimates need at least one photo or PDF attached).
- **Add photos to something that exists**: "add these photos to my last invoice" (attach the photos). If more than one record matches, the bot lists up to three and you reply with a number.
- **Keyword reports** (same as the email commands): `help`, `estimates`, `invoices`, `pending` (or `todo`), `activity`. Report commands are admin / household-admin only.
- **`cancel`** (or NO) throws away the current draft — staged photos are deleted, nothing is filed.

The bot answers in your preferred language (English or Portuguese), applies exactly the same permission rules as the app (contractors can only file invoices for their own properties, and so on), and every created item lands in the app instantly — with the usual bell notifications and admin emails.

### WhatsApp notifications

With your channel set to **WhatsApp** or **Both**, the notices that today arrive by email/bell — new estimate or invoice in your property, an estimate decision, an invoice marked paid, chat messages and @mentions — also arrive as WhatsApp messages, each with a link that opens LedgerX straight to the right record.

---

## Viewing Editing & Searching Transactions
<!-- roles: contractor, member, admin -->

The **Expense List** shows all transactions for your selected household, newest first.

### Search, sort & filters

For short transaction lists, the **Filter** chip is tucked in the top-right of the section so the page stays clean. Tap it to reveal the full search bar, sort control, and filter controls. If you've logged more than 25 transactions, the toolbar shows up automatically.

The toolbar gives you:
- **Search** — vendor, category, notes, or household name (real-time)
- **Sort** — always-visible dropdown next to the search box: date (newest/oldest), amount (highest/lowest), vendor (A→Z), category (A→Z). Re-orders instantly without a reload, and works on top of any active filters.
- **Filter panel** (behind the filter button): category, household, date range, amount range

### Editing a transaction

1. Click any transaction in the list.
2. Update fields as needed.
3. Click **Save**.

> The raw OCR text is hidden behind a small **"View raw OCR text"** toggle in the edit screen, so you only see it when you actually need it.

### Deleting a transaction

1. Click the transaction.
2. Click **Delete** — the button morphs into a red **"Tap again to confirm"**.
3. Tap it once more within 3 seconds to commit. If you don't tap again, the button reverts to its normal state and nothing happens.

> Deletions are permanent — receipt images are also removed.

---

## Uploading Receipts
<!-- roles: contractor, member, admin -->

You can attach receipts when adding or editing any transaction.

- **Supported formats:** JPG, PNG, WebP, **PDF**
- **Multiple files:** Attach as many receipts as you need — useful for itemized orders, multi-page invoices, or corrected receipts.
- **Compression:** Images are automatically compressed before upload so you can use phone photos directly.
- **PDF receipts:** Show as a document icon in the thumbnail grid. Click to open the PDF in a new tab.
- **Image receipts:** Click any thumbnail to open a full-size view with zoom controls (+ / −).
- **Primary receipt:** The first file attached is the primary. It appears in exports and reports.

---

## Spending Charts
<!-- roles: member, admin -->

Your dashboard includes two charts that update automatically as you add transactions:

- **Monthly Spending** — An area chart showing your spending total for each of the last 6 months.
- **Spending by Category** — A pie chart breaking down where your money is going across all categories.

Charts respond to your **household selection** — switch households at the top to see that household's data.

---

## Exporting Your Data
<!-- roles: member, admin -->

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
<!-- roles: member, admin -->

**Reports** let you analyze spending with flexible filters:

- **Household** — Scope to one household
- **Category** — Filter by expense type
- **Date Range** — Set a custom start and end date
- **Submitted by** _(admins only)_ — Tick any combination of people in the selected households. Leave the list empty to include everyone in scope, or click **Just my submissions** to see only your own.
- **Sort by** — Reorder results without re-running the query: by date (oldest or newest first), submitter, amount (high or low), vendor, or category. The sort you pick is also used in the PDF and CSV exports.

The on-screen results table — and the PDF/CSV exports — include a **Submitted by** column for admins, so you can always see whose receipt is whose. Regular users see only their own submissions, and the Submitted by column is hidden for them.

Reports show a breakdown of matching transactions so you can spot trends and stay on budget.

---

## Surgeon NPI Lookup
<!-- roles: contractor, member, admin -->

For medical-device and healthcare households, LedgerX can look up a surgeon's **NPI (National Provider Identifier)** directly from the expense form and drop it into your notes.

### How it works

1. An admin enables **Surgeon NPI Lookup** for your household (Admin → Manage Households → Features).
2. When adding or editing an expense in that household, a **🔍 Lookup NPI** button appears beside the Notes field.
3. Click it, search by name (e.g. "Smith" or "John Smith"), pick a result, and a line like `Surgeon: Dr. John Smith, MD, NPI: 1234567890` is appended to your notes.

Results come from the public CMS NPPES registry. The button is hidden for households that don't have the feature enabled.

---

## LedgerX Labs
<!-- roles: member, admin -->

**LedgerX Labs** is a home for experimental tools we're trying out before deciding whether they graduate into the main app. Labs features may change or be removed — feedback is welcome. **LedgerX Labs is only available to full admins and household admins** — regular members and contractors never see it, even in households where it's turned on.

### Credit Card Reconciliation

The first Labs experiment: match expense receipts against the line items on a credit card statement, so you can confirm every charge on the card has a matching receipt on file.

1. An admin enables **Labs: Credit Card Reconciliation** for a household (Admin → Manage Households → Features).
2. An admin uploads a card statement — as a CSV export, or as a PDF/photo that LedgerX reads automatically — under **LedgerX Labs → Credit Card Reconciliation**. A statement isn't tied to one household, since one card often covers more than one property.
3. An admin (full admin or household admin) opens the statement and works through its line items, matching each one to a receipt already in LedgerX. Matching looks across **every property enrolled in the experiment** — for a property's receipts to appear, an admin turns on **Labs: Credit Card Reconciliation** for that household under Manage Households → Features. Once enrolled, any admin can match a charge to the right receipt no matter which property it belongs to. A receipt is suggested whenever its **amount** matches the charge — the date and vendor only affect the ordering, so a receipt logged weeks later or with an edited vendor name still shows up. A persistent **Auto-match** button clears the obvious ones in one tap, and every match can be undone. If the suggestions don't include the receipt you're after, use the search box to **browse the full list of receipts** and pick the right one by hand.
4. You can also start from a receipt you already have: open it from your transaction list and choose **Match to card statement** to search for its line item directly. Once matched, that transaction shows a small violet **Matched** tag in your transaction list.

Only a full admin can upload statements — and rename one later by tapping the pencil icon next to it, handy for fixing a typo or clarifying which card it is.

---

## What's New (Footer Link)
<!-- roles: contractor, member, admin -->

A **What's New** link lives in the **footer** at the bottom of every
page, next to the app version. Tap it to see what's been shipped
recently — version, date, and a short description of each release.

The link shows a **small red dot** when there's a release you haven't
read. Opening the panel clears the dot. Read state is per browser/device,
so signing in on your phone after reading on your laptop will briefly
show the dot again until you open it there too.

We use this to keep you in the loop as features ship — no more silent
updates.

## Notifications (Bell Icon)
<!-- roles: contractor, member, admin -->

The **bell** in the top corner is a real notification center. It shows a
count when there's something new for you:

- a **new message** on an estimate you're part of,
- **someone @mentioned you** in a conversation (shown as "mentioned you"),
- a **new estimate or invoice** submitted in your household,
- an **estimate reviewed** (accepted/rejected) or an **invoice marked paid**.

Tap the bell to see the list, then **tap an item to jump straight to it** —
LedgerX opens the exact estimate (with its chat thread) or invoice the
notification is about — anything you have access to view — and marks it read at
the same time. Use **Mark all
read** to mark everything read at once. To tidy the list, hover (or tap) a
notification and use its **trash icon** to remove it, or **Clear all** to empty
the bell entirely — removing a notification only clears it from your bell; the
underlying invoice, estimate, and chat messages are untouched. You're only
notified about things that involve you — you never get a note about your own
action, and contractors only hear about the estimates and invoices they
submitted themselves. (Receipts/expenses don't generate bell notifications.)
The list refreshes when you return to the tab.

### @mentioning someone in a conversation

Inside any estimate conversation, you can call out a specific person by typing
**`@` followed by their username** — for example, `@maria can you confirm the
price?`. When you send the message:

- **they get an email** letting them know they were mentioned, with a button
  that opens LedgerX **straight to that conversation** (they'll need to be
  signed in);
- the mention is **highlighted** in the chat bubble, and appears in their
  notification bell as "**mentioned you**" (a stronger signal than an ordinary
  new-message note — they won't get both);
- the email goes only to that person, and only to the **real email address**
  they've saved in Settings.

You can only mention people who can already see that estimate (its creator,
invited participants, and the property's members/admins). A typed `@name` that
doesn't match someone on the estimate is simply ignored — no email is sent.

---

## Keyboard shortcuts
<!-- roles: contractor, member, admin -->

Most modals close cleanly with **Esc** — Add Transaction, Edit Transaction, Submit Invoice, Settings, Export, Reports, the welcome tour, and What's New all listen for it. Same in the account menu (top-right avatar): tap outside or press Esc to dismiss.

---

## Account Settings
<!-- roles: contractor, member, admin -->

Open **Settings** from the **avatar dropdown** in the top-right header. The avatar is available to every account — regular users, contractors, household admins, and full admins all use the same settings panel to manage their language, password, real email, and email-forwarding senders.

### Add or Update Email

Adding an email to your account unlocks **self-service password reset** — so you can recover access without contacting an admin.

1. Open Settings.
2. Enter your email address under **Add Email**.
3. Click **Add Email** to save.

### Change Password

1. Open Settings.
2. Enter your new password under **Change Password**.
3. Click **Change Password** to save.

### Email Forwarding

The bottom of Settings also contains the **Email Forwarding** manager — register the addresses you'll forward receipts and invoices from, see what's currently registered, and remove ones you no longer use. See the [Email Inbox](#email-inbox-forward-receipts-by-email) section for the full workflow.

---

## Managing Households
<!-- roles: member, admin -->

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
<!-- roles: admin -->

Admin accounts see an **Admin Panel** instead of the regular Dashboard.

The admin panel has a **full-width dark header** at the top with the LedgerX logo plus the avatar menu (Settings, Help, Sign Out) — consistent with all other user types. The **What's New** link sits in the footer at the bottom of the page. Below the header, a sidebar handles navigation and the main area shows the active view. The **Invoices** and **Estimates** management screens each include a **Submit** button so you can add one without leaving the screen.

**Home screen:** When you sign in as a full admin, you land on a command-center home screen with:
- **Quick Actions** — Add Transaction and Submit Invoice buttons
- **Navigate to** — tiles for Uncategorized, Invoices, My Transactions, Analytics, and Reports
- **Configuration** — tiles for Households, Categories, Vendors, and Users

**Sidebar navigation:**
- **Home** — returns to the command center from any view
- **Manage** (collapsible) — expands to show Households, Categories, Vendors, and Users
- Uncategorized · Invoices · My Transactions · Analytics · Reports

### Analytics

- Total spending and transaction count across all households
- Spending breakdown by category with charts
- Filterable by date range, household, category, **and submitter**
- Submitter filter shows a **Just me** chip plus one chip per other person who submitted in the date window — toggle any combination to scope charts, totals, the recent-transactions list, and the CSV/PDF export
- Each transaction row in the list also shows the submitter's @username, so it's clear who entered what
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
- See each user's **last sign-in** alongside the join date, so you can quickly spot dormant accounts (or confirm a teammate has logged in since you reset their password). Accounts that have never signed in show "Never signed in".

**Creating a user:** the household checklist in the create-user dialog starts empty — tick only the properties this user should see, and they get exactly that access. (The old behaviour silently joined every new user to every property.) You can adjust a user's properties at any time later via the **Households** button on their row.

### Manage Categories

- Create, edit, and delete categories
- Scope categories to a specific household or make them global
- Each household only sees categories assigned to it
- **Select All / Clear All** in the household picker for fast bulk assignment
- The picker is scrollable with a fixed header and footer, so it works even with long household lists

### Uncategorized Transactions

- Review all transactions missing a category
- Assign categories in bulk from one view

### Contractor Invoices
<!-- roles: admin -->

- View all invoices submitted by contractors and household admins
- Filter by status (Pending / Paid) and property
- Click any invoice to see full details and attached documents
- **Mark Paid** to record that payment was issued (timestamp recorded); full admins only. When you mark an invoice paid you can optionally record **how** it was paid — Venmo, Zelle, ACH/bank transfer, check, credit card, or "Other" (with a free-text note) — and the method then shows on the invoice detail.
- **Edit Details** (full admins only) — fix any core field on an invoice: the **invoice number** (handy when a contractor submits without one), **amount**, **description**, **service dates**, property, category, and admin notes. Opens a single edit dialog from the invoice detail.
- **Assign Category** (full admins only) — tag any invoice with a category so it rolls up into Analytics alongside receipts. The picker only shows categories valid for the invoice's household (globals + any explicitly mapped).
- **Add photos any time** — open any invoice and use the **Add photos** button under the attachments to add more pictures after submission. Anyone on the property can contribute, not just the submitter. Images are auto-shrunk to a sharp, readable size (~1600px, ~0.6MB) before saving to keep them legible while saving storage; PDFs are kept as-is.

**Email notifications:** Both new invoice AND new receipt submissions trigger an email summary to every full admin with a real email on file. Household admins also get the email, but only for submissions in households they actually belong to — so a household admin for *Beach House* never sees a *Mountain Cabin* notification. The submitter is never emailed about their own submission. When a full admin marks an invoice as paid, the submitter receives a separate confirmation email.

**Inactivity reminders:** If you haven't signed in or submitted anything for **14 days**, LedgerX sends you a gentle (and randomly worded — never the same form letter twice in a row) reminder email with a one-tap link back into the app. If you keep ignoring it: a second nudge at 30 days, then about monthly. As soon as you log in or file something, the clock resets and the reminders stop. This applies to full admins and household admins.

### Estimates
<!-- roles: admin -->

Contractors can submit **estimates** (quotes) for you to review and discuss before any work is invoiced. Open the **Estimates** section from the nav (or the Estimates tile on the admin home).

- See every estimate submitted by contractors, with a red badge showing unread messages
- Filter by status (Open / Accepted / Rejected) and property; sort by date
- Click an estimate to open it: the submitted JPEG/PDF files (PDFs open in a new tab), the contractor's description, and the **conversation thread**
- **Chat back and forth** — post replies right in the estimate; the contractor sees them and can respond
- **Accept** or **Reject** the estimate (or **Reopen** a decided one) — the status is visible to the contractor
- **Edit** (full admins only) — fix the estimate's title, description, billing type, property, or admin notes from the detail view.
- **Delete** removes the estimate along with its files and messages. Estimate files are retained until you delete them — nothing is auto-cleaned.

**Add photos any time:** open any estimate you can see and use the **Add photos** button under the attachments to add more pictures after it was submitted — anyone on the property can contribute, not just the submitter. Images are automatically shrunk to a sharp, readable size (roughly 1600px, ~0.6MB) before saving, so they stay legible while using far less storage; PDFs are kept exactly as-is.

**Billing type:** every estimate now includes a billing type — **Total bill** or **Labor only (materials separate)**. This shows as a badge on each estimate card so you know at a glance whether materials are included in the quoted price.

**Network visibility:** any user who shares a property with the contractor can see that contractor's estimates. This includes household admins, regular users, and other contractors in the same properties. Network viewers can see the full estimate details, attachments, and conversation history. Non-contractor members of the property — household admins and regular users — can also **join the conversation and post messages**, alongside the original submitter and full admins. Other contractors in the same property stay read-only (they can view but not post) unless they're the submitter or were explicitly invited. Only full admins can change the estimate's status.

**Submitting your own estimate:** if a subcontractor sends you a quote directly, you can log it yourself — tap **Submit an estimate** on the admin home, pick any property, and attach the JPEG or PDF. It appears in the Estimates section alongside contractor-submitted ones, ready to accept, reject, or discuss.

**Email notifications:** when a contractor submits a new estimate, every full admin with a real email on file is notified — same as invoices and receipts. (Estimates you file yourself don't email the other admins.)

**Inviting participants:** admins can invite any user — regardless of household membership — into a specific estimate's conversation. Open the estimate detail, find the **Invited participants** section, type the person's username (without @), and tap **Invite**. The invited user immediately sees the estimate in their dashboard and can post messages in the conversation thread. Only full admins can invite; invited users cannot add further participants themselves.

### Activity Report
<!-- roles: admin, household_admin -->

A chronological feed of who's been doing what across the people you oversee. Open it from the nav (or the **Activity** quick-action on the admin home).

- **Activity feed** — every receipt submission, invoice submission, mark-paid event, and estimate event (submitted, accepted, rejected) in one timeline. Tap any row to open the underlying receipt, invoice, or estimate without leaving the screen.
- **Last logins** — one row per user with the last time they signed in. Handy for spotting contractors who've gone quiet.
- **Filters** — date range (defaults to the last 30 days), household, person, and event type chips at the top (including the three estimate event types).

**Who sees whose activity:**
- Full admins see activity for every user, across every household.
- Household admins see activity only for contractors and regular members of households they belong to. They do not see other admins, other household admins, or themselves.
- Contractors and regular users do not see the Activity menu item.

### Estimate Report
<!-- roles: admin, household_admin -->

A focused report on the estimate pipeline. Open it from the nav (or the **Estimate report** quick-action on the admin home).

- **Summary** — cards for estimates submitted, accepted, rejected, and still open in the selected date range, plus your **acceptance rate** and **average decision time** (how long from submission to accept/reject). A per-contractor breakdown shows each contractor's submitted/accepted/rejected counts and their acceptance rate.
- **Open & aging** — every estimate still awaiting a decision, oldest first, with an age in days. Anything sitting longer than two weeks is flagged **Stale** so nothing slips through the cracks. (This view always shows all open estimates, regardless of the date range.)
- **Filters** — property and a date range (the range applies to the Summary tab only).

**Scope** mirrors the Activity Report: full admins see all properties; household admins see contractors and members in their own properties.

---

### Email Commands & Notifications
<!-- roles: all -->

**Ask by email:** email `receipts@90ten.life` with a single word as the subject and LedgerX replies automatically:
- `help` — anyone: the list of commands.
- `estimates` — admins & household admins: a quick pipeline summary (open / accepted / rejected, acceptance rate, and how many are aging past two weeks).
- `invoices` — admins & household admins: pending vs. paid counts and the pending total.
- `pending` (or `todo`) — admins & household admins: what needs attention — invoices awaiting approval and estimates open for over two weeks (full admins also see the count of uncategorized transactions).
- `activity` — admins & household admins: a last-7-days pulse — new estimates, invoices, and receipts, plus how many members haven't signed in for over two weeks.

Household admins get results scoped to their own households; full admins see everything.

It only works from the email address saved on your profile — that's how LedgerX knows who you are. No attachment is needed; an email *with* an attachment is still processed as a receipt/invoice as usual.

**Activity nudges:** whenever an invoice or estimate sees new activity (submitted, accepted/rejected, or marked paid), everyone in that property gets a short heads-up email so they can check in — no amounts or details, just a nudge to open the app. Contractors are only nudged about the invoices and estimates they submitted themselves, and ordinary transactions never trigger these emails.

---

## Household Admin Role
<!-- roles: admin -->

Household admins are a scaled-down admin role. They can do everything a contractor can (submit receipts, submit invoices) **plus** read-only oversight of the households they belong to.

**What a household admin can do:**
- Submit receipts (Add Transaction) and invoices (Submit Invoice)
- View **My Transactions** — a list of every receipt they've personally submitted (filtered to their own work)
- View **Analytics** for households they're a member of (opens as a modal overlay from the nav)
- View the **Contractor Invoices** list (read-only — no Mark Paid button)
- View **Reports**

**What a household admin cannot do (full admin only):**
- Mark invoices paid
- Create, modify, or delete households
- Create, modify, or delete users
- Create or assign categories
- Edit or delete expenses submitted by others (their own are editable)

Assign the role from **Manage Users → role dropdown → Household Admin**.

### Mark Expenses as Paid
<!-- roles: admin -->

- In **Analytics → Recent Transactions**, each expense row shows a circle-check (✓) button
- Click it to toggle the paid status — the button turns green and a **Paid** badge appears on the expense
- The badge is visible to the user who submitted the expense, so they always know whether their receipt has been paid

---

## Contractor Role
<!-- roles: contractor -->

Contractors see a simplified dashboard with three actions:

1. **Add Transaction** — submit a receipt as usual
2. **Submit Invoice** — upload a PDF or image of your invoice
3. **Submit an estimate** — send a quote for the admin to review and discuss

**How invoice submission works:**
1. Tap **Submit Invoice**
2. Upload your invoice PDF or JPG — fields are filled in automatically via OCR
3. Review and correct any extracted details (amount, service period, description — invoice # is optional)
4. Select the property the work was performed at
5. Optionally pick a **Category** — only categories available for the selected property are shown. Leave blank if unsure; a full admin can assign one later.
6. Tap **Submit Invoice** to send it to your admin

**Viewing a submitted invoice:** tap any row in **My Invoices** to open the detail panel. You'll see the full invoice, any admin notes, and every attachment you uploaded — PDFs open in a new tab.

**Deleting a submitted invoice:** the detail panel has a red **Delete invoice** button — only the original submitter sees it. Use this if you uploaded the wrong PDF or fixed numbers in a fresh upload. Full admins can also delete any invoice from the admin detail view (cleanup tool).

**Invoice statuses:**
- 🟡 **Pending** — submitted, awaiting payment
- 🟢 **Paid** — payment has been issued

> **Tip:** Regular expense receipts you submit also get a green **Paid** badge once an admin marks them paid — so you always know the status of every receipt you've submitted.

**Email notifications:** Once an admin marks your invoice paid, you'll receive a confirmation email (if you have a real email address on file in Settings). Conversely, every time you submit a new invoice OR a new receipt, the admins for that property are emailed automatically — no extra step, no follow-up message needed.

**Work-in-progress photos (contractors only):** When submitting a receipt or invoice, contractors see a **Work-in-progress photos** section underneath the main attachments. Snap or upload photos of the job itself — before/after shots, materials, the leak you just fixed, the wall you painted. They're stored as compact JPEGs (≈0.4 MB each) so they don't blow up your data plan, and admins see them in their own labeled gallery when reviewing the submission. This replaces the WhatsApp / text-message workflow of sending job photos out-of-band. Regular users and household admins do not see this section — it only appears on contractor accounts.

### Estimates (Quotes)
<!-- roles: contractor -->

Estimates let you send a quote to the admin *before* the work happens — and then talk it through right inside LedgerX, instead of over text or email.

**Submitting an estimate:**
1. Tap **Submit an estimate**
2. Pick the **property** the quote is for
3. Give it a short **title** (e.g. "Roof repair quote") and, optionally, a description
4. Choose the **billing type**: **Total bill** (everything included) or **Labor only (materials separate)**
5. Attach your estimate as a **JPEG or PDF** (you can add more than one file)
6. Tap **Submit estimate**

**The conversation thread:** every estimate has its own chat. Open any estimate in **My estimates** to see the files you sent and a message area at the bottom. You and the admin can go back and forth there — ask questions, clarify scope, agree on a number. When the admin replies, a small red badge with the message count appears on that estimate so you know there's something new to read.

**Estimate statuses:**
- 🟡 **Open** — submitted and under discussion
- 🟢 **Accepted** — the admin approved the quote
- ⚪ **Rejected** — the admin declined it

Your estimate files stay on record until an admin removes them — there's no contractor delete button for estimates, so nothing you send disappears on its own.

**Household admins** get the same **Add Transaction**, **Submit Invoice**, and **Submit Estimate** buttons at the top of the admin panel — oversight and submission live side by side, so you don't have to switch accounts to log your own work. Receipts you submit appear under the **My Transactions** nav item, so you can review what you've entered without opening Analytics.

---

## FAQ & Troubleshooting
<!-- roles: contractor, member, admin -->

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
rsync -avz --delete dist/ root@72.62.174.193:/var/www/ledger.90ten.life/
```

---

## License

Proprietary. All rights reserved.

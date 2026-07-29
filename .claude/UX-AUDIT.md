# UX audit — "too many options"

Written for v13.16 in response to owner feedback that users are confused by
the sheer number of options. Internal document; not shipped to users.

The brief was **audit first, ship only the safe wins** — changes that are
unambiguously right (hiding controls a role literally cannot use, merging
genuinely duplicated destinations, collapsing advanced things by default).
Anything that moves where people expect to find things waits for sign-off.

---

## 1. What users actually face today

Counts measured from `src/components/admin/AdminLayout.tsx` and
`src/components/Dashboard.tsx` at v13.15.

### Full admin — ~15 destinations, plus 16 home tiles

| Surface | Items |
|---|---|
| Sidebar, top | Home |
| Sidebar, "Manage" group | Households, Categories, Vendors, Users (4) |
| Sidebar, "Labs" group | Tax Center (1) |
| Sidebar, flat | Uncategorized, Invoices, Estimates, Transactions, Reconciliation\*, Analytics, Reports, Activity, Estimate report (9) |
| **Home screen** | 3 Quick Actions + 5 Review tiles + 4 Insight tiles + 4 Configuration tiles = **16** |

\* only when the household is enrolled in `labs_cc_reconciliation`.

The home tiles are **not** additional capability — they are a second copy of
the sidebar. A full admin therefore meets roughly 31 controls before doing
anything, covering ~15 actual places.

### Household admin — 8 destinations

Invoices, Estimates, Transactions, Reconciliation\*, Analytics, Reports,
Activity, Estimate report. No Home, no Manage group, no Labs. Notably: **no
home screen at all**, so they land directly on Invoices.

### Members and contractors — 4 sections

Collapsible sections on the Dashboard, not nav items: Inbox (only when
non-empty), Transactions, Estimates, Insights (collapsed by default). A
contractor sees My Invoices, Estimates, My Receipts instead. This surface is
**not** the problem — it is already well-disclosed.

---

## 2. The single biggest source of duplication

Four separate destinations all answer "show me numbers", and all four are
modals opened from `AdminLayout.tsx`:

| Destination | Component | What it answers |
|---|---|---|
| Analytics | `AdminAnalytics.tsx` | Spend by category/household/submitter, charts, CSV+PDF |
| Reports | `Reports.tsx` | Filtered spending reports, CSV+PDF |
| Activity | `ActivityReport.tsx` | Who submitted / paid / signed in |
| Estimate report | `EstimateReport.tsx` | Estimate pipeline, acceptance rate, aging |

Analytics and Reports overlap heavily — both are spending views, both filter
by date/household/category, both export CSV and PDF. A user cannot tell from
the names which one to open, and the honest answer is "either".

**Recommendation: merge all four into one "Reports" destination with four
tabs.** That takes the full-admin sidebar from ~15 to ~12 and, more
importantly, replaces four ambiguous names with one obvious one.

**✅ APPROVED BY THE OWNER AND SHIPPED IN v13.18.** `ReportsHub.tsx`. Measured
result: the full-admin sidebar went from **12 items to 9**.

The relocation risk was mitigated rather than accepted: the four **Insights
tiles on the admin home keep their own names** (Analytics / Reports /
Activity / Estimate Report) and each opens the hub *directly on its own tab*,
so anyone navigating by tile sees no change at all. Only the sidebar
consolidated. The hub also remembers the last tab per device, so the generic
sidebar entry returns you where you were.

Implementation note worth keeping: the four components were **not rewritten**.
Each now renders bare — no overlay, no header, no close button — when
`onClose` is omitted, which is the convention `AdminAnalytics` already used
for exactly this purpose. Their internal state, filters and exports are
untouched.

---

## 3. Shipped in v13.16 (cleared the "unambiguous" bar)

1. **Copy that promised something a role can't do.** `adminInvoices.subtitle`
   read "Review contractor invoice submissions." for household admins too —
   but `AdminInvoices.tsx:54` sets `canMutateStatus = isAdmin`, so a household
   admin cannot mark anything paid. They now get their own line saying a full
   admin does that. (It was also wrong for full admins: the list includes
   invoices the viewer filed themselves, which are not "contractor
   submissions".)

2. **Admin home "Configuration" tiles now start collapsed.** Four tiles that
   duplicate the sidebar's always-present "Manage" group, on the screen every
   admin lands on. Reuses `CollapsibleSection`, so the choice persists per
   device and nothing is removed — one tap reopens it.

3. **Sidebar "Manage" group now starts closed** (was `useState(true)`). Four
   configuration screens were permanently expanded above nine daily-use
   items. The group header stays visible and labelled.

4. **One name per thing on the transactions screen.** The nav said "My
   Transactions", the screen said "My Receipts", and it showed only your own
   rows while counting the whole household. Now: one "Transactions"
   destination showing everything, with a "Just mine" chip.

5. **Accurate section subtitles**, including new ones where a section had
   none. See §4.

---

## 4. Subtitle accuracy pass

Every section heading was checked against the query that actually feeds it.

| Where | Was | Verdict | Now |
|---|---|---|---|
| Transactions (admin) | *no subtitle at all* | Only major admin screen without one | "Every transaction across your properties. Tap 'Just mine' …" |
| Transactions (member) | "Transactions", no subtitle | List is own-only (`useExpenses(…, {ownOnly:true})`) but the title reads global | + "Receipts you've submitted." |
| Invoices (full admin) | "Review contractor invoice submissions." | Includes the viewer's own invoices | Rewritten to name all three sources |
| Invoices (household admin) | same string | They cannot act on it | Own string; says a full admin marks paid |
| Estimates (admin) | "Review estimates submitted by contractors…" | `AdminEstimates.tsx:83` selects **all** estimates, including the admin's own | "Every estimate for your properties, including ones you filed…" |
| Estimates (contractor) | "My estimates" | `list_visible_estimates()` also returns household-shared and invited-into estimates | "Estimates" + "Yours, plus any you've been invited into." |
| Estimates (member) | "Estimates from contractors in your properties." | Accurate | unchanged |
| Uncategorized | "Transactions with missing households or invalid categories…" | Accurate | unchanged |

`CollapsibleSection` gained an optional `subtitle` prop — before this, no
member-facing dashboard section could carry one at all.

---

## 5. Deferred — needs owner sign-off

| Change | Why it's deferred |
|---|---|
| ~~Merge Analytics + Reports + Activity + Estimate report into one tabbed hub~~ | **Done in v13.18** — see §2 |
| Remove the home screen's Review and Insights tiles as sidebar duplicates | **Considered and rejected as a "safe win."** On mobile the sidebar is behind the hamburger, so those tiles are the *primary* navigation, not a duplicate. Removing them would make the phone experience worse, not simpler. |
| Reorder or rename remaining sidebar items | Pure muscle-memory cost with no correctness argument |
| A per-user "Simple / Advanced" mode | Real option, but it's a new concept to learn and would need its own design pass |

---

## 6. Resolved

Household admins saw **Analytics**, **Reports**, **Activity** and **Estimate
report** — four reporting destinations for a role whose day job is submitting
and reviewing their own properties' work. The v13.18 hub applies to them too:
their sidebar went from **8 items to 5**, which is proportionally the bigger
win.

# Admin Panel Redesign — Design Spec

**Date:** 2026-05-01  
**Status:** Approved  
**Scope:** `src/components/admin/AdminLayout.tsx` only — no schema, no data, no other components

---

## Problem

The super-admin (`isAdmin`) experience has four concrete issues:

1. **No home screen.** Full admins land directly on `ManageHouseholds` — there is no overview or orientation point.
2. **9 flat sidebar items** with no visual hierarchy. Management tools (Households, Categories, Vendors, Users) sit alongside daily-use tools (Invoices, Analytics) in an undifferentiated list.
3. **Sign-out is in the wrong place.** On desktop it is at the sidebar bottom; on mobile it is in the mobile header. The regular-user `Dashboard` puts it top-right in the header — the admin should match.
4. **Action buttons float above every view.** "Add Transaction" and "Submit Invoice" appear at the top of every admin sub-view, cluttering pages that have nothing to do with submission.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Home screen style | Command center (nav tiles + action CTAs) | No live data to query; pure navigation is faster and has no loading state |
| Sidebar nav structure | Collapsible "Manage" group | Shrinks top-level items from 9 to 6; config tools are "set it and forget it" |
| Sign-out placement | Top-right header (matches Dashboard) | Consistency across all user types |
| Action buttons | Home screen only, removed from sub-views | Sub-views stay focused; admin comes home to submit |

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo] LedgerX  [Admin Panel badge]          [🔔] [?] [Sign out] │  ← Full-width dark header
├────────────────────┬────────────────────────────────────────────┤
│  🏠 Home           │                                            │
│  ──────────────    │         Main content area                  │
│  ⚙️ Manage    ▾   │         (home screen or sub-view)          │
│    · Households    │                                            │
│    · Categories    │                                            │
│    · Vendors       │                                            │
│    · Users         │                                            │
│  ──────────────    │                                            │
│  ⚠️ Uncategorized  │                                            │
│  🧱 Invoices       │                                            │
│  🧾 My Transactions│                                            │
│  📊 Analytics      │                                            │
│  📄 Reports        │                                            │
└────────────────────┴────────────────────────────────────────────┘
```

### Top Header (`AdminTopHeader`)

- Spans the full viewport width, above both sidebar and content
- Background: `bg-gradient-to-r from-emerald-950 to-emerald-900` (matches current sidebar gradient)
- **Left:** Logo icon + "LedgerX" wordmark (via `<LogoText />`) + "Admin Panel" badge
- **Right:** version string · `<BellButton>` (What's New) · Help `?` icon button · Sign Out button
- Sign Out uses the same icon-button style as Help — `LogOut` icon, text label visible on `sm:` and up
- This replaces the current mobile-only `<header>` and the desktop sidebar's internal header block

### Sidebar (`AdminSidebar`)

- Navigation only — no logo, no header, no footer
- Width: `w-56` (224px) — current is `w-64` (256px), slightly narrower to give content more room
- Background: `bg-emerald-950` continuing from the header gradient
- **Nav items:**
  1. 🏠 **Home** — navigates to `'home'` view (new)
  2. *(divider)*
  3. ⚙️ **Manage** — collapsible group toggle (chevron rotates on expand)
     - 🏘 Households
     - 🏷 Categories
     - 🏪 Vendors
     - 👤 Users
  4. *(divider)*
  5. ⚠️ Uncategorized
  6. 🧱 Invoices
  7. 🧾 My Transactions
  8. 📊 Analytics — opens as a modal overlay (unchanged behavior)
  9. 📄 Reports — opens as a modal overlay (unchanged behavior)
- **Manage group:** expanded by default on first load (nothing hidden), collapsible via click. State stored in component state (not localStorage — no need to persist).
- Active item: `bg-emerald-700` pill (unchanged from current style)
- What's New and Help **removed** from sidebar — they live in the header now

### Mobile

- The existing mobile `<header>` is replaced by the same full-width `AdminTopHeader`
- Hamburger menu toggles the sidebar as a slide-in drawer (same pattern as today)
- Sign Out and Help live in `AdminTopHeader`, which is always visible on mobile — they are not duplicated in the hamburger drawer

---

## Home Screen (`AdminHomeView`)

Displayed when `activeView === 'home'`. The command center.

### Structure

```
Welcome back, [username]
What would you like to do?

── Quick Actions ──────────────────────────────────
  [ + Add Transaction ]   [ 📄 Submit Invoice ]
   (dark emerald)          (white / outlined)

── Navigate To ────────────────────────────────────
  ⚠️ Uncategorized  🧱 Invoices  🧾 My Transactions
  📊 Analytics      📄 Reports

── Configuration ──────────────────────────────────
  🏘 Households  🏷 Categories  🏪 Vendors  👤 Users
```

### Details

- **Quick Actions row:** same button components already used elsewhere (dark emerald primary, white secondary). Opens the existing `AddExpense` / `InvoiceForm` modals — no new logic needed.
- **Navigate To grid:** 5 tiles in a `grid-cols-5` row (collapses to `grid-cols-3` on mobile). Each tile is a white card with icon + label. Clicking navigates to the corresponding `activeView`. The Uncategorized tile uses an amber-tinted border to signal it needs attention.
- **Configuration grid:** 4 tiles in `grid-cols-4` (collapses to `grid-cols-2` on mobile). Visually quieter — `bg-slate-50` background, smaller icons — to signal these are secondary/infrequent.
- Username: derive from `useAuth()`'s `user.email` by splitting on `@` — e.g. `user.email?.split('@')[0] ?? 'admin'`. This gives the LedgerX username (the `@ledgerx.local` internal emails). Check the existing `useT` hook's interpolation syntax (likely `{{name}}`) before wiring up `admin.welcomeBack`.
- **No live data / counts** on tiles. No async calls from the home screen. Fast, static.

### Action buttons removed from sub-views

The `canSubmit` block that currently renders the action buttons above every sub-view is **removed**. The buttons exist only on the home screen. Sub-views render their content full-width with no toolbar above them.

---

## `AdminView` Type Update

Add `'home'` to the `AdminView` union:

```ts
type AdminView = 'home' | 'households' | 'categories' | 'vendors' | 'uncategorized' | 'users' | 'invoices' | 'reports' | 'my-transactions';
```

Default landing view changes:

```ts
// Before
const [activeView, setActiveView] = useState<AdminView>(
  isAdmin ? 'households' : 'invoices'
);

// After
const [activeView, setActiveView] = useState<AdminView>(
  isAdmin ? 'home' : 'invoices'  // HAs still land on invoices
);
```

Household admins (`isHouseholdAdmin`) do **not** get the home screen — they continue to land on `'invoices'` and their nav is unchanged.

---

## i18n Keys Required

All new user-visible strings must be added to both `src/i18n/en.json` and `src/i18n/pt-BR.json`:

| Key | English | Notes |
|---|---|---|
| `admin.home` | `"Home"` | Sidebar nav label |
| `admin.manage` | `"Manage"` | Collapsible group label |
| `admin.configuration` | `"Configuration"` | Home screen section label |
| `admin.navigateTo` | `"Navigate to"` | Home screen section label |
| `admin.quickActions` | `"Quick Actions"` | Home screen section label |
| `admin.welcomeBack` | `"Welcome back, {{name}}"` | Home screen greeting |
| `admin.welcomeSub` | `"What would you like to do?"` | Home screen subtitle |

---

## What Does NOT Change

- The sub-view components themselves (`ManageHouseholds`, `AdminInvoices`, etc.) — untouched
- The `AdminAnalytics` and `Reports` modal overlay pattern — unchanged
- Household admin nav (`haItems`) — unchanged
- Mobile hamburger drawer pattern — kept, just rebuilt from the new components
- All existing active-state, loading skeleton, and lazy-loading patterns

---

## Out of Scope

- Live counts / badges on home screen tiles
- Persisting "Manage" group collapsed/expanded state across sessions
- Any changes to sub-view components
- Household admin experience changes

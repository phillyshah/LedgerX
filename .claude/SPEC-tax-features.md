# Tax features spec — Schedule E classification + 1099-NEC readiness

Status: **implemented in v13.15**. Kept as the design rationale doc; see
`.claude/HANDOFF.md` for deploy state.

## Operating assumptions (confirmed with the owner)

- All households in this app are **rental properties held inside an LLC**,
  owned for years. Not owner-occupied, not recently acquired.
- The LLC has **no applicable financial statement** (no audited financials),
  so the **de minimis safe harbor is $2,500 per invoice/item**, not $5,000.
- Because the properties are long-held, acquisition-cost capitalization is
  settled history. The live, recurring decision is **repair vs. capital
  improvement on ongoing work** — which is exactly what the review queue
  targets.
- **Form mapping caveat**: a *single-member* LLC is disregarded, so rentals
  land on **Schedule E Part I** of the 1040. A *multi-member* LLC files Form
  1065 and reports rentals on **Form 8825**, flowing to Schedule E Part II via
  K-1. Form 8825's expense lines are near-identical to Schedule E Part I, so
  one category→line mapping drives both. The UI states this rather than
  guessing which applies.
- These are mechanics, not tax advice. The category→line mapping and the
  current-year thresholds should be signed off by the owner's CPA once; after
  that the app just applies those decisions consistently.

## Why these two features

The app is already excellent at *recording* money leaving. Both features
target what it can't currently answer: what the spending means at tax time,
and where there's an unmet filing obligation.

## Feature 1 — Schedule E classification & export

### The money at stake

Every property expense is either a currently-deductible repair or an
improvement that must be capitalized and depreciated over 27.5 years
(residential rental, straight line, mid-month). For an $8,000 item that's
~$2,600 back this year at a 32% marginal rate versus ~$290/year for 27.5
years. Wrong in the other direction is audit exposure.

### Auto-categorization: three layers

The owner specifically asked whether Schedule E categorization can be
automated. It can, mostly:

| Layer | Mechanism | Coverage |
|---|---|---|
| 1. Category → line | `categories.schedule_e_line`, mapped once | ~90% of rows, permanently |
| 2. Vendor → line fallback | existing `vendor_category_map` → category → line | most of the remainder |
| 3. Repair vs. improvement | amount threshold + keyword heuristics | **suggestion only** |

Layers 1–2 are fully deterministic — no AI, no per-expense work after the
one-time mapping. Layer 3 is deliberately **not** auto-applied: the
betterment/restoration/adaptation test is a legal judgment, and a wrong
answer that silently flows into a return is worse than no answer. It
pre-fills a one-tap confirm in a review queue instead.

### The schema wrinkle

```
expenses.category               -> text (free-form name, no FK)
contractor_invoices.category_id -> uuid FK to categories(id)
```

The two money sources reference categories *differently*. Any rollup must
join expenses by lower/trimmed **name** and invoices by **id**, or you build
the report twice and get two different totals. Normalizing `expenses.category`
to a real FK is worth doing eventually but is not a prerequisite.

### Cash basis

Expenses filter on `expense_date`; invoices filter on `paid_at` with
`status = 'paid'`. An invoice for December work paid in January belongs to the
*following* tax year. Using `service_date_start` would quietly shift
deductions between years.

## Feature 2 — 1099-NEC readiness

### Deliberately storing nothing sensitive

**Owner's decision, confirmed after the first build:** the accountant files
the 1099s and keeps the paperwork, so the app should hold no identity data at
all.

The first draft already rejected a `tin` column — an SSN in a Postgres column
is a permanent breach liability. But it still uploaded the signed W-9 to a
private `tax-docs` bucket, and **a W-9 has the TIN printed on it**, so that
was storing the number by another route. The bucket, the `w9_doc_path`
column, and the address fields were all removed.

What remains is four fields plus bookkeeping:

| Field | Why it's needed |
|---|---|
| `legal_name` | identifies the payee on the accountant's list |
| `entity_type` | decides whether a 1099 is required at all (corps exempt) |
| `w9_received_at` | a **date** — "collected, filed elsewhere" |
| `is_exempt_payee`, `notes` | manual override + free text |

Addresses went too: they're on the W-9 the accountant already holds, and
nothing in the app consumes them. Keeping a second copy is redundant PII with
no purpose.

The migration also tears down the bucket, its policies, its stored objects,
and the dropped columns, so applying it over the earlier draft converges to
the same clean state.

The test suite asserts the *absence* of all of this — no TIN/SSN/EIN column,
no document-reference column, no address columns, no `tax-docs` bucket, and
an exact column count — so a future change can't quietly reintroduce it.

### Three rules the app can enforce that people get wrong

**1. Payment method decides who files.** The app already stores
`payment_method`, which is more than most systems have:

| Method | Treatment | Why |
|---|---|---|
| `credit` | **excluded** | card processor reports on 1099-K; a 1099-NEC would double-report |
| `zelle` | **reportable** | Zelle is bank-to-bank, not a TPSO — issues no 1099-K |
| `check`, `ach`, `other` | **reportable** | payor's obligation |
| `venmo` | **ambiguous** | business-profile payments get a 1099-K from Venmo; P2P don't |
| `null` | **reportable**, flagged | conservative default; UI warns the method wasn't recorded |

**2. Corporations are generally exempt** from 1099-NEC (attorneys and
medical/health payments are the classic exceptions, which the app can't detect
and therefore surfaces rather than decides). This is the main reason to
capture `entity_type` at all. Unknown entity type is treated as *required* and
flagged, not silently skipped.

**3. Cash basis** — aggregate on `paid_at`, not service dates.

### The threshold is no longer $600

Legislation enacted July 2025 raised the 1099-NEC/MISC reporting threshold
from $600 to **$2,000 for payments made after 2025-12-31**, indexed for
inflation thereafter. Tax year 2026 is therefore a $2,000 year.

Because it now moves with inflation, the threshold is a **config row**
(`tax_settings.form_1099_threshold`), never a hard-coded constant. Same for
the de minimis threshold. This is the single most important structural
decision in this spec.

## Access control

Both features are **full admin (`is_admin`) only**, per the owner's explicit
instruction.

- Category management is already full-admin-only in the role model, so the
  Schedule E line-mapping UI inherits correct gating for free.
- The reports themselves need an **explicit `isAdmin` check**. Household
  admins do get "reports" generally, so gating on the reports group would
  leak both features to them.
- Server-side, every RPC re-checks `is_admin()` and
  `contractor_tax_profiles` carries an admin-only RLS policy. The client gate
  is convenience; the server gate is the actual boundary.

## UI shape

A single **Tax Center** modal with three tabs sharing one tax-year selector,
rather than three separate nav entries:

- **Schedule E** — per-property × per-line matrix, unmapped-category warning,
  CSV export
- **Capital review** — the repair/improvement queue, pre-filled suggestions
- **1099-NEC** — contractors by reportable total, W-9 status, CSV for the CPA

One nav item, one mental model, one gate.

### Highest-value single element

The **live W-9 badge on the contractor list** — "$1,840 YTD · no W-9" — shown
year-round, not just in January. Collecting a W-9 before the first payment is
trivial; chasing a contractor for one after the job ended is the failure mode
the whole feature exists to prevent.

## Deliberately out of scope

- **Depreciation schedules** for capitalized items. Real feature, genuinely
  separate; capturing the repair/improvement decision is the prerequisite and
  has to land first.
- **Income / rent roll.** Without it the app can only ever answer half of
  "is this property making money." Recommended as the next major step.

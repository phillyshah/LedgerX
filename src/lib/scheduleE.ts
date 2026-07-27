import type { CapitalTreatment } from './database.types';

/**
 * Pure helpers for the tax features. No DB access, no React — everything here
 * is deterministic so it can be reasoned about (and tested) in isolation.
 *
 * Schedule E lines are DB rows, not a constant in here: they're editable, so
 * the list and its labels come from `list_schedule_e_lines`. What stays here
 * is the small set of stable *codes* the suggestion heuristic keys off.
 */

export interface ScheduleELineRow {
  id: string;
  code: string;
  label: string;
  /** Official Schedule E Part I line number (5-19); null for custom lines. */
  line_number: number | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
}

export type SuggestionConfidence = 'high' | 'low';

export interface TreatmentSuggestion {
  treatment: CapitalTreatment | null;
  confidence: SuggestionConfidence;
  /** i18n key explaining *why*, so the admin can sanity-check the call. */
  reasonKey: string;
}

/**
 * Words that signal a betterment, restoration, or adaptation — the three
 * things that force capitalization. Deliberately conservative: these produce
 * a *suggestion* the admin confirms, never an automatic write, because the
 * call is a legal judgment with audit consequences.
 */
const IMPROVEMENT_PATTERNS = [
  /\bnew roof\b/i,
  /\breplace(d|ment)?\s+(the\s+)?(roof|hvac|furnace|boiler|water heater|windows?|siding|deck)\b/i,
  /\bremodel(ing|ed)?\b/i,
  /\brenovat(e|ed|ion)\b/i,
  /\baddition\b/i,
  /\bbuild(ing)?\s+(a\s+)?new\b/i,
  /\bfull\s+(rebuild|replacement|gut)\b/i,
  /\bupgrade[ds]?\s+(the\s+)?(electrical|plumbing|hvac)\b/i,
  /\bconvert(ed|ing|sion)?\b/i,
];

/**
 * Line codes whose whole purpose is upkeep — a strong "repair" signal.
 * Matched on `code`, which is immutable, so renaming or reordering a line in
 * the UI never changes what the heuristic does.
 */
const REPAIR_LINE_CODES = ['repairs', 'cleaning_maintenance', 'supplies'];

/**
 * Suggests a capital treatment for one transaction.
 *
 * Order matters. The de minimis safe harbor is checked first because it's a
 * bright-line dollar rule that doesn't care what the work was: for a taxpayer
 * without an applicable financial statement, an invoice at or under the
 * threshold can be expensed currently regardless of whether it would
 * otherwise be an improvement.
 */
export function suggestTreatment(params: {
  amount: number;
  deMinimisThreshold: number;
  /** Stable line `code`, not the editable label. */
  lineCode?: string | null;
  text?: (string | null | undefined)[];
}): TreatmentSuggestion {
  const { amount, deMinimisThreshold, lineCode, text = [] } = params;

  if (amount <= deMinimisThreshold) {
    return { treatment: 'repair', confidence: 'high', reasonKey: 'tax.reason.deMinimis' };
  }

  const haystack = text.filter(Boolean).join(' ');
  if (haystack && IMPROVEMENT_PATTERNS.some((re) => re.test(haystack))) {
    return { treatment: 'improvement', confidence: 'low', reasonKey: 'tax.reason.improvementKeyword' };
  }

  if (lineCode && REPAIR_LINE_CODES.includes(lineCode)) {
    return { treatment: 'repair', confidence: 'low', reasonKey: 'tax.reason.maintenanceCategory' };
  }

  return { treatment: null, confidence: 'low', reasonKey: 'tax.reason.needsJudgment' };
}

/**
 * Tax years to offer in the year picker: current year back through 2023,
 * newest first. Uses the *local* year — these are US rental properties and
 * the report is anchored to the LLC's tax home, matching tax_year_of() in
 * the migration.
 */
export function taxYearOptions(now = new Date()): number[] {
  const current = now.getFullYear();
  const years: number[] = [];
  for (let y = current; y >= 2023; y--) years.push(y);
  return years;
}

export interface ScheduleERow {
  household_id: string | null;
  household_name: string | null;
  line_id: string | null;
  line_code: string | null;
  line_label: string | null;
  line_number: number | null;
  line_sort: number | null;
  treatment: CapitalTreatment | null;
  total: number;
  txn_count: number;
  source: 'expense' | 'invoice';
}

export interface ScheduleEPivot {
  households: { id: string | null; name: string }[];
  /** Active lines that actually carry money, in the admin's chosen order. */
  lines: { id: string; code: string; label: string; number: number | null }[];
  /** `cells[lineId][householdId]` — only currently-deductible amounts. */
  cells: Map<string, Map<string, number>>;
  lineTotals: Map<string, number>;
  householdTotals: Map<string, number>;
  grandTotal: number;
  /** Capitalized separately: these do NOT belong on a Schedule E expense
   *  line, they go into the depreciation schedule. */
  capitalized: number;
  /** Money whose category has no Schedule E mapping yet. */
  unmapped: number;
}

const HOUSEHOLD_KEY = (id: string | null) => id ?? '__none__';

/**
 * Pivots the flat RPC rows into the report matrix.
 *
 * Improvements are pulled OUT of the line totals on purpose. An amount that's
 * been marked as a capital improvement isn't a Schedule E expense at all that
 * year — it's basis to depreciate. Summing it into "Repairs" would overstate
 * the deduction, which is the exact error this feature exists to prevent.
 */
export function pivotScheduleE(rows: ScheduleERow[]): ScheduleEPivot {
  const householdNames = new Map<string, string>();
  const lineMeta = new Map<string, { id: string; code: string; label: string; number: number | null; sort: number }>();
  const cells = new Map<string, Map<string, number>>();
  const lineTotals = new Map<string, number>();
  const householdTotals = new Map<string, number>();
  let grandTotal = 0;
  let capitalized = 0;
  let unmapped = 0;

  for (const r of rows) {
    const hKey = HOUSEHOLD_KEY(r.household_id);
    if (!householdNames.has(hKey)) householdNames.set(hKey, r.household_name ?? '');

    if (r.treatment === 'improvement') {
      capitalized += r.total;
      continue;
    }
    if (!r.line_id) {
      unmapped += r.total;
      continue;
    }

    if (!lineMeta.has(r.line_id)) {
      lineMeta.set(r.line_id, {
        id: r.line_id,
        code: r.line_code ?? '',
        label: r.line_label ?? '',
        number: r.line_number,
        sort: r.line_sort ?? 0,
      });
    }

    let row = cells.get(r.line_id);
    if (!row) {
      row = new Map<string, number>();
      cells.set(r.line_id, row);
    }
    row.set(hKey, (row.get(hKey) ?? 0) + r.total);
    lineTotals.set(r.line_id, (lineTotals.get(r.line_id) ?? 0) + r.total);
    householdTotals.set(hKey, (householdTotals.get(hKey) ?? 0) + r.total);
    grandTotal += r.total;
  }

  const households = [...householdNames.entries()]
    .map(([id, name]) => ({ id: id === '__none__' ? null : id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Respect the admin's sort_order, then label — the report reads in the
  // order they arranged the lines, not insertion order.
  const lines = [...lineMeta.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
    .map(({ id, code, label, number }) => ({ id, code, label, number }));

  return { households, lines, cells, lineTotals, householdTotals, grandTotal, capitalized, unmapped };
}

export const householdKey = HOUSEHOLD_KEY;

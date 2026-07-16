import { parseExpenseDate } from './dateUtils';
import type { Expense } from '../types/expense';

export interface StatementLineItem {
  id: string;
  line_date: string;
  description: string;
  amount: number;
  matched_expense_id: string | null;
}

export interface MatchCandidate {
  expense: Expense;
  score: number;
  reasons: string[];
}

// AMOUNT IS THE ONLY HARD GATE. Per product decision: a matching amount alone
// qualifies an expense as a candidate — date and vendor must NEVER exclude it.
// Receipts get logged/dated well after a charge posts (work done then invoiced,
// backlogged reimbursements), and the user can freely edit the vendor name, so
// neither is reliable enough to disqualify a dollar-for-dollar match. Amounts
// are compared with a small tolerance for rounding; exact scores 1.0.
const AMOUNT_MATCH_TOLERANCE = 0.5;

// Defensive: Postgres `numeric` columns can arrive from PostgREST as strings.
// Subtraction would coerce anyway, but normalize so every comparison/sort is
// unambiguously numeric.
function num(v: number | string): number {
  return typeof v === 'number' ? v : parseFloat(v);
}

function amountScore(lineAmount: number | string, expenseTotal: number | string): number {
  const diff = Math.abs(num(lineAmount) - num(expenseTotal));
  if (diff >= AMOUNT_MATCH_TOLERANCE) return -1; // the sole disqualifier
  return 1 - diff / AMOUNT_MATCH_TOLERANCE;
}

// Date is a soft confidence/ranking signal only — it decays with distance but
// NEVER excludes. A generous falloff so a receipt logged a month after the
// charge still ranks as a plausible (if lower-confidence) match rather than
// vanishing. Returns [0, 1].
const DATE_FALLOFF_DAYS = 60;

function daysApart(lineDate: string, expenseDate: string): number {
  const a = parseExpenseDate(lineDate).getTime();
  const b = parseExpenseDate(expenseDate).getTime();
  return Math.abs(a - b) / 86_400_000;
}

function dateProximity(days: number): number {
  if (days >= DATE_FALLOFF_DAYS) return 0;
  return 1 - days / DATE_FALLOFF_DAYS;
}

// Pure tiebreaker — card merchant codes are often cryptic ("SQ *CORNER
// MARKET" vs "Corner Market") and the user can rename the vendor, so this
// only nudges ranking, never excludes and never required.
function textOverlapScore(description: string, vendor: string | null): number {
  if (!vendor) return 0;
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const a = words(description);
  const b = words(vendor);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const w of a) if (b.has(w)) overlap++;
  return overlap / Math.max(a.size, b.size);
}

/** Score one line item against one candidate expense. Null ONLY when the amount doesn't match. */
export function scoreCandidate(lineItem: StatementLineItem, expense: Expense): MatchCandidate | null {
  const aScore = amountScore(lineItem.amount, expense.total);
  if (aScore < 0) return null; // amount is the only thing that can disqualify

  const days = daysApart(lineItem.line_date, expense.expense_date);
  const dScore = dateProximity(days);
  const tScore = textOverlapScore(lineItem.description, expense.vendor);

  // Amount dominates; date is a secondary confidence signal; vendor a faint
  // tiebreaker. Rounded to kill floating-point dust so an exact amount + exact
  // date lands on a clean 0.95 (comfortably over the 0.9 auto-match line)
  // instead of 0.9499999….
  const score = Math.round((aScore * 0.7 + dScore * 0.25 + tScore * 0.05) * 1000) / 1000;

  const reasons: string[] = [];
  if (aScore === 1) reasons.push('exactAmount');
  else reasons.push('closeAmount');
  if (days < 1) reasons.push('exactDate');
  else if (days <= 7) reasons.push('closeDate');
  if (tScore >= 0.3) reasons.push('vendorMatch');

  return { expense, score, reasons };
}

/** Rank every eligible expense against a line item, best first. */
export function rankCandidates(lineItem: StatementLineItem, expenses: Expense[]): MatchCandidate[] {
  return expenses
    .map((e) => scoreCandidate(lineItem, e))
    .filter((c): c is MatchCandidate => c !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * A closeness score for sorting the full "browse all receipts" universe —
 * unlike scoreCandidate() this NEVER excludes an out-of-bounds expense, so
 * the manual picker can still surface a receipt the strict suggestion cutoff
 * dropped. Higher = closer. Not used for the trusted "Suggested" list or
 * bulk auto-match (those stay strict via rankCandidates/isHighConfidence).
 */
export function looseScore(lineItem: StatementLineItem, expense: Expense): number {
  const amountDiff = Math.abs(num(lineItem.amount) - num(expense.total));
  const dateDiff = daysApart(lineItem.line_date, expense.expense_date);
  // Amount dominates (a card charge should match its receipt to the cent),
  // then date proximity; both are negative contributions so smaller diffs
  // sort first. Scale keeps amount ahead of date for realistic values.
  return -(amountDiff * 100 + dateDiff);
}

/** Every expense scored for the manual browse list, closest first — no exclusion. */
export function rankAllForBrowse(lineItem: StatementLineItem, expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => looseScore(lineItem, b) - looseScore(lineItem, a));
}

/** High-confidence = top score >=0.9 with a clear margin over the runner-up — eligible for bulk auto-match. */
export function isHighConfidence(candidates: MatchCandidate[]): boolean {
  if (candidates.length === 0 || candidates[0].score < 0.9) return false;
  if (candidates.length === 1) return true;
  return candidates[0].score - candidates[1].score >= 0.15;
}

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

// Amount is the hard primary signal — a card charge and its receipt total
// should match to the cent. Exact match scores 1.0, linear falloff, excluded
// past 50 cents off.
const AMOUNT_EXCLUDE_CENTS = 0.5;

function amountScore(lineAmount: number, expenseTotal: number): number {
  const diff = Math.abs(lineAmount - expenseTotal);
  if (diff >= AMOUNT_EXCLUDE_CENTS) return -1;
  return 1 - diff / AMOUNT_EXCLUDE_CENTS;
}

// Date decays to excluded past ±7 days — a receipt is usually dated the same
// day as the charge, occasionally a few days off for post/settlement lag.
const DATE_EXCLUDE_DAYS = 7;

function dateScore(lineDate: string, expenseDate: string): number {
  const a = parseExpenseDate(lineDate).getTime();
  const b = parseExpenseDate(expenseDate).getTime();
  const days = Math.abs(a - b) / 86_400_000;
  if (days >= DATE_EXCLUDE_DAYS) return -1;
  return 1 - days / DATE_EXCLUDE_DAYS;
}

// Pure tiebreaker — card merchant codes are often cryptic ("SQ *CORNER
// MARKET" vs "Corner Market"), so this only nudges ranking, never excludes.
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

/** Score one line item against one candidate expense. Null if outside the hard amount/date bounds. */
export function scoreCandidate(lineItem: StatementLineItem, expense: Expense): MatchCandidate | null {
  const aScore = amountScore(lineItem.amount, expense.total);
  const dScore = dateScore(lineItem.line_date, expense.expense_date);
  if (aScore < 0 || dScore < 0) return null;

  const tScore = textOverlapScore(lineItem.description, expense.vendor);
  // Amount and date dominate; text is a tiebreaker weighted much lower.
  const score = aScore * 0.6 + dScore * 0.3 + tScore * 0.1;

  const reasons: string[] = [];
  if (aScore === 1) reasons.push('exactAmount');
  else if (aScore >= 0.8) reasons.push('closeAmount');
  if (dScore === 1) reasons.push('exactDate');
  else if (dScore >= 0.6) reasons.push('closeDate');
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

/** High-confidence = top score >=0.9 with a clear margin over the runner-up — eligible for bulk auto-match. */
export function isHighConfidence(candidates: MatchCandidate[]): boolean {
  if (candidates.length === 0 || candidates[0].score < 0.9) return false;
  if (candidates.length === 1) return true;
  return candidates[0].score - candidates[1].score >= 0.15;
}

/**
 * Forces OCR'd dates read as 2023 to 2026.
 *
 * Why this exists: gpt-4o-mini reading low-detail receipt images misreads the
 * year digit "6" as "3" often enough that 2026 receipts keep landing in the
 * ledger as 2023. Nothing in the date value itself distinguishes "misread"
 * from "genuinely old" — that ambiguity is exactly why the older, gentler
 * repairs (extract-receipt's future-date clamp, statementDateRepair's
 * billing-period check) leave past dates alone. They only catch a subset.
 *
 * The owner's explicit call (2026-08-10): treat *every* OCR'd 2023 as a
 * misread 2026, and accept that genuinely-2023 receipts get moved. Wrong
 * dates on the rare old receipt are preferable to the ongoing stream of
 * current receipts filed three years in the past.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS A HARDCODED, TIME-LIMITED RULE. Both years below are literal. Come
 * January 2027 this will happily rewrite genuine 2023 dates to 2026 while
 * doing nothing for 2027 receipts misread as 2023. Revisit it then — either
 * bump CORRECTED_YEAR, or delete this module and go back to the structural
 * repairs once the OCR model handles the digit correctly.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The one exception to "always": if rewriting the year would produce a date
 * in the future, the original is kept. A receipt dated next month is never
 * right, and fabricating one is worse than leaving OCR's answer alone — it
 * would also collide with extract-receipt's future-date clamp, which would
 * then drag the date back to an entirely different year. Invoice due dates
 * opt out of that guard via `allowFuture`, since those legitimately fall
 * ahead of today.
 */

import { todayDateString } from './dateUtils';

export const OCR_MISREAD_YEAR = 2023;
export const OCR_CORRECTED_YEAR = 2026;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Options {
  /** Permit the rewritten date to land in the future (invoice due dates). */
  allowFuture?: boolean;
  /** Local today as YYYY-MM-DD; injectable for tests. */
  today?: string;
}

/**
 * Rewrites a YYYY-MM-DD string whose year is OCR_MISREAD_YEAR to
 * OCR_CORRECTED_YEAR. Anything else — a different year, a malformed string,
 * null — passes through untouched.
 */
export function forceOcrYear<T extends string | null | undefined>(
  date: T,
  options: Options = {}
): T {
  if (typeof date !== 'string') return date;

  const m = ISO_DATE.exec(date);
  if (!m) return date;
  if (Number(m[1]) !== OCR_MISREAD_YEAR) return date;

  const corrected = `${OCR_CORRECTED_YEAR}-${m[2]}-${m[3]}`;

  if (!options.allowFuture) {
    const t = ISO_DATE.exec(options.today ?? todayDateString());
    if (t) {
      // Local-time construction on both sides — never `new Date(string)`,
      // which parses as UTC and shifts the day (CLAUDE.md date rule).
      const rewritten = new Date(OCR_CORRECTED_YEAR, Number(m[2]) - 1, Number(m[3]));
      const today = new Date(Number(t[1]), Number(t[2]) - 1, Number(t[3]));
      if (rewritten.getTime() > today.getTime()) return date;
    }
  }

  return corrected as T;
}

/**
 * Applies forceOcrYear to named date fields on an OCR result object, in
 * place of the caller spelling out one assignment per field. Returns a new
 * object; the input is not mutated.
 */
export function forceOcrYearOnFields<T extends Record<string, unknown>>(
  data: T,
  fields: readonly (keyof T)[],
  options: Options = {}
): T {
  const out = { ...data };
  for (const field of fields) {
    const value = out[field];
    if (typeof value === 'string') {
      out[field] = forceOcrYear(value, options) as T[keyof T];
    }
  }
  return out;
}

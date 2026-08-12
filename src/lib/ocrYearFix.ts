/**
 * Repairs OCR'd dates whose YEAR the model got wrong.
 *
 * Why this exists, and why the original framing was wrong
 * ──────────────────────────────────────────────────────────────────────────
 * v13.20 assumed a single failure mode: gpt-4o-mini misreading the digit "6"
 * as "3", so a 2026 receipt lands as 2023. That does happen. But the receipt
 * that prompted v13.21 printed its dates as `08/12/26` — a TWO-DIGIT year.
 * There was no "2026" on the page to misread. The model had to *expand* "26",
 * and the prompt gave it no idea what year it is, so it guessed.
 *
 * That reframes the problem. The durable fix is the prompt: every extractor
 * now tells the model today's date and how to expand a two-digit year (see
 * `extract-receipt`, `extract-invoice`, `extract-statement`, `inbound-email`,
 * `whatsapp-inbound`). This module is the safety net behind that, not the
 * primary defence.
 *
 * What it does
 * ──────────────────────────────────────────────────────────────────────────
 * Rewrites a date whose year is OCR_MISREAD_YEAR (2023) to the most recent
 * year that does not put the date in the future — normally OCR_CORRECTED_YEAR
 * (2026), falling back to 2025, then 2024.
 *
 * That fallback is the v13.21 fix. v13.20 refused the rewrite outright when
 * 2026 would land in the future and returned the ORIGINAL 2023 date, so with
 * today = 2026-08-12 every 2023 date from Aug 13 to Dec 31 — about 40% of the
 * calendar — was silently left in 2023. The guard meant to prevent inventing a
 * future date was instead preserving the exact bug it sat next to.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STILL HARDCODED AND TIME-LIMITED. The trigger year is a literal. Come 2027
 * this rewrites genuine 2023 dates while doing nothing for a 2027 misread.
 * The prompt anchor above is what should make this module redundant; when the
 * extraction is reliably right, delete it rather than bump the constants.
 *
 * NOTE ON SCOPE: only 2023 triggers a rewrite. A two-digit-year misread can
 * equally produce 2024 or 2025, and those still pass through untouched — that
 * is deliberate. Widening the trigger would start moving legitimately old
 * receipts, which the reconciliation feature exists to process, and the owner
 * only ever signed off on 2023. Revisit if 2024/2025 misreads show up.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Invoice due dates opt out of the not-in-the-future rule via `allowFuture`,
 * since those legitimately fall ahead of today.
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
 * Rewrites a YYYY-MM-DD string whose year is OCR_MISREAD_YEAR to the most
 * recent year that keeps it out of the future. Anything else — a different
 * year, a malformed string, null — passes through untouched.
 */
export function forceOcrYear<T extends string | null | undefined>(
  date: T,
  options: Options = {}
): T {
  if (typeof date !== 'string') return date;

  const m = ISO_DATE.exec(date);
  if (!m) return date;
  if (Number(m[1]) !== OCR_MISREAD_YEAR) return date;

  const month = Number(m[2]);
  const day = Number(m[3]);

  if (options.allowFuture) {
    return `${OCR_CORRECTED_YEAR}-${m[2]}-${m[3]}` as T;
  }

  const t = ISO_DATE.exec(options.today ?? todayDateString());
  if (!t) return `${OCR_CORRECTED_YEAR}-${m[2]}-${m[3]}` as T;

  // Local-time construction on both sides — never `new Date(string)`, which
  // parses as UTC and shifts the day (CLAUDE.md date rule).
  const today = new Date(Number(t[1]), Number(t[2]) - 1, Number(t[3]));

  // Walk back from the corrected year to the first one that isn't in the
  // future. Stops above the misread year itself, so we never "correct" a date
  // to the year we already believe is wrong.
  for (let year = OCR_CORRECTED_YEAR; year > OCR_MISREAD_YEAR; year--) {
    const candidate = new Date(year, month - 1, day);
    // Rejects Feb 29 in a non-leap year, which Date rolls over into March.
    if (candidate.getMonth() !== month - 1) continue;
    if (candidate.getTime() <= today.getTime()) {
      return `${year}-${m[2]}-${m[3]}` as T;
    }
  }

  // Every candidate year was still in the future — leave OCR's answer alone.
  return date;
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

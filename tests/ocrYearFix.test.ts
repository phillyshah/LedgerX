/**
 * Tests for the OCR year repair.
 *
 * Every case here is anchored to a FIXED "today" (2026-08-12 — the day the
 * @onion receipt came in dated 2023) rather than the real clock, so the suite
 * gives the same answer in 2027 as it does today. `forceOcrYear` takes `today`
 * as an option precisely so this is possible.
 */

import { forceOcrYear, forceOcrYearOnFields } from '../src/lib/ocrYearFix';
import { test, eq } from './harness';

const TODAY = '2026-08-12';
const on = { today: TODAY };

// ── The bug that started this: a receipt dated today, read as 2023 ───────────
test('2023 date matching today rolls forward to 2026', () => {
  eq(forceOcrYear('2023-08-12', on), '2026-08-12');
});

test('2023 date earlier in the year rolls forward to 2026', () => {
  eq(forceOcrYear('2023-01-05', on), '2026-01-05');
  eq(forceOcrYear('2023-08-11', on), '2026-08-11');
});

// ── The v13.20 regression: dates later in the year were silently left alone ──
// 2026-09-15 is in the future, so v13.20 refused the rewrite and returned the
// original 2023 date. Roughly 40% of the calendar behaved this way. The repair
// should instead fall back to the most recent year that isn't in the future.
test('2023 date later in the year falls back to 2025, not left in 2023', () => {
  eq(forceOcrYear('2023-08-13', on), '2025-08-13');
  eq(forceOcrYear('2023-09-15', on), '2025-09-15');
  eq(forceOcrYear('2023-12-31', on), '2025-12-31');
});

test('no repaired date is ever in the future', () => {
  const today = new Date(2026, 7, 12).getTime();
  for (let month = 1; month <= 12; month++) {
    for (const day of [1, 15, 28]) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const out = forceOcrYear(`2023-${mm}-${dd}`, on)!;
      const [y, m, d] = out.split('-').map(Number);
      if (new Date(y, m - 1, d).getTime() > today) {
        throw new Error(`2023-${mm}-${dd} repaired to ${out}, which is in the future`);
      }
    }
  }
});

test('every 2023 input in the matrix actually moves off 2023', () => {
  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, '0');
    const out = forceOcrYear(`2023-${mm}-15`, on)!;
    if (out.startsWith('2023-')) {
      throw new Error(`2023-${mm}-15 was left in 2023 (got ${out})`);
    }
  }
});

// ── allowFuture — invoice due dates legitimately sit ahead of today ──────────
test('allowFuture jumps straight to 2026 even when that is in the future', () => {
  eq(forceOcrYear('2023-12-31', { ...on, allowFuture: true }), '2026-12-31');
});

// ── Non-2023 input is left strictly alone ───────────────────────────────────
test('other years pass through untouched', () => {
  eq(forceOcrYear('2026-08-12', on), '2026-08-12');
  eq(forceOcrYear('2024-03-09', on), '2024-03-09');
  eq(forceOcrYear('2025-11-20', on), '2025-11-20');
  eq(forceOcrYear('2019-06-01', on), '2019-06-01');
});

test('malformed and empty input passes through untouched', () => {
  eq(forceOcrYear(null, on), null);
  eq(forceOcrYear(undefined, on), undefined);
  eq(forceOcrYear('', on), '');
  eq(forceOcrYear('not a date', on), 'not a date');
  eq(forceOcrYear('08/12/2023', on), '08/12/2023');
  eq(forceOcrYear('2023-8-12', on), '2023-8-12');
});

// ── Feb 29 — Date() rolls it into March in a non-leap year ───────────────────
// 2024 is the only leap year in the walk-back range, so a 2023-02-29 input
// (invalid, but a model can emit it) must not become "2026-02-29".
test('Feb 29 lands on a real leap year, never an invented date', () => {
  const out = forceOcrYear('2023-02-29', on)!;
  eq(out, '2024-02-29');
});

// ── Idempotence — client and edge function both apply this ──────────────────
test('applying the repair twice changes nothing', () => {
  for (const input of ['2023-08-12', '2023-12-31', '2023-02-29', '2026-01-01']) {
    const once = forceOcrYear(input, on);
    const twice = forceOcrYear(once, on);
    eq(twice, once);
  }
});

// ── forceOcrYearOnFields ────────────────────────────────────────────────────
test('field helper repairs only the named fields and does not mutate input', () => {
  const input = {
    invoice_date: '2023-03-01',
    due_date: '2023-03-31',
    vendor_name: '2023-not-a-date-field',
  };
  const out = forceOcrYearOnFields(input, ['invoice_date', 'due_date'], on);
  eq(out.invoice_date, '2026-03-01');
  eq(out.due_date, '2026-03-31');
  eq(out.vendor_name, '2023-not-a-date-field');
  eq(input.invoice_date, '2023-03-01'); // original untouched
});

test('field helper tolerates missing and non-string fields', () => {
  const out = forceOcrYearOnFields(
    { a: '2023-01-01', b: null, c: 42 },
    ['a', 'b', 'c', 'missing' as 'a'],
    on,
  );
  eq(out.a, '2026-01-01');
  eq(out.b, null);
  eq(out.c, 42);
});

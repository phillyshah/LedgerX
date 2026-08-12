/**
 * Guards the ROOT CAUSE, not the symptom.
 *
 * The receipt that triggered v13.21 printed its dates as `08/12/26` — a
 * two-digit year. Nothing was misread; the model was asked to produce a
 * YYYY-MM-DD date and never told what year it is, so it expanded "26" on its
 * own and guessed wrong. `extract-receipt` had carried a temporal anchor for a
 * while, but the four prompts inside `inbound-email` did not — which is exactly
 * why the emailed-receipt path kept failing after the year-repair rule shipped.
 *
 * The year repair is a safety net with a hardcoded trigger year. The prompt
 * anchor is the actual fix. This test makes sure nobody quietly removes it,
 * or adds a new date-extracting prompt without one.
 */

import { readFileSync } from 'node:fs';
import { test } from './harness';

/** Files whose prompts ask a model for a date. */
const PROMPT_FILES = [
  'supabase/functions/extract-receipt/index.ts',
  'supabase/functions/extract-invoice/index.ts',
  'supabase/functions/extract-statement/index.ts',
  'supabase/functions/inbound-email/index.ts',
  'supabase/functions/whatsapp-inbound/index.ts',
];

/**
 * An anchor is any construct that puts the current date into the prompt text.
 * Matching on intent rather than an exact string keeps this from becoming a
 * brittle copy of the prompts themselves.
 */
const ANCHOR_PATTERNS = [
  /Today is \$\{/,
  /relative to today \(\$\{/,
  /\$\{todayIso\}/,
  /\$\{safeToday\}/,
  /\$\{today\}/,
  /infer the year from the statement period/,
];

for (const file of PROMPT_FILES) {
  test(`${file} anchors its date prompts to the current date`, () => {
    const source = readFileSync(file, 'utf8');
    const anchored = ANCHOR_PATTERNS.some((p) => p.test(source));
    if (!anchored) {
      throw new Error(
        `${file} asks a model for dates but never tells it today's date. ` +
        `A receipt printing a two-digit year ("08/12/26") will be expanded ` +
        `to whatever year the model guesses.`,
      );
    }
  });
}

test('inbound-email tells the model how to expand a two-digit year', () => {
  const source = readFileSync('supabase/functions/inbound-email/index.ts', 'utf8');
  if (!/two-digit year/i.test(source)) {
    throw new Error(
      'inbound-email lost its two-digit-year instruction — the exact failure ' +
      'that produced a 2023 date from a receipt printed "08/12/26"',
    );
  }
});

test('inbound-email repairs invoice dates, not only expense dates', () => {
  const source = readFileSync('supabase/functions/inbound-email/index.ts', 'utf8');
  // The original bug: `if (kind === "expense" && prefilled.transaction_date)`
  // meant detectKind() calling a receipt an "invoice" skipped the repair
  // entirely. Retailer receipts print "Invoice #12345" constantly.
  if (/kind === "expense" && prefilled\.transaction_date/.test(source)) {
    throw new Error(
      'the year repair is gated on kind === "expense" again — anything ' +
      'detectKind() labels an invoice will keep its raw OCR year',
    );
  }
  if (!/prefilled\.invoice_date = forceMisreadYear/.test(source)) {
    throw new Error('inbound-email no longer repairs prefilled.invoice_date');
  }
});

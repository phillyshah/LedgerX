/**
 * Proves the hand-mirrored copies of the year repair actually agree with the
 * canonical one in `src/lib/ocrYearFix.ts`.
 *
 * Deno edge functions can't import from `src/`, so the logic is copy-pasted
 * into five of them. Every copy carries a "keep in sync" comment — and a
 * comment is not a guarantee. This test extracts `forceMisreadYear` from each
 * function's source, runs it, and diffs the result against the client across a
 * date matrix. A copy that drifts fails the build instead of quietly filing
 * someone's receipt in the wrong year.
 *
 * Why this matters more than usual here: edge functions deploy BY HAND through
 * the Supabase dashboard. Drift between repo and repo is the failure this
 * catches; drift between repo and production is a separate problem that only
 * pasting can fix.
 */

import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { forceOcrYear } from '../src/lib/ocrYearFix';
import { test, eq } from './harness';

const FUNCTIONS = [
  'extract-receipt',
  'extract-invoice',
  'extract-statement',
  'inbound-email',
  'whatsapp-inbound',
];

/** Pulls a top-level `function name(...) {...}` out of source by brace matching. */
function extractFunction(source: string, name: string): string | null {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Compiles an edge function's copy into a callable. Returns null when the
 * function doesn't carry a copy at all, which the caller reports as a failure
 * rather than a skip.
 */
function loadEdgeCopy(fnName: string): ((d: string, t: string, f?: boolean) => unknown) | null {
  const path = `supabase/functions/${fnName}/index.ts`;
  const source = readFileSync(path, 'utf8');
  const body = extractFunction(source, 'forceMisreadYear');
  if (!body) return null;

  // The copies read the two constants from module scope; the whatsapp-inbound
  // variant reads the real clock rather than taking `todayIso`, so its wrapper
  // ignores the extra argument.
  const ts = `
    const OCR_MISREAD_YEAR = 2023;
    const OCR_CORRECTED_YEAR = 2026;
    ${body}
    export const call = (d, t, f) => forceMisreadYear(d, t, f);
  `;
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports.call as (d: string, t: string, f?: boolean) => unknown;
}

const TODAY = '2026-08-12';

/** Dates chosen to straddle "today" — the boundary v13.20 got wrong. */
const MATRIX = [
  '2023-01-01', '2023-02-28', '2023-02-29', '2023-06-30',
  '2023-08-11', '2023-08-12', '2023-08-13', '2023-09-15',
  '2023-10-31', '2023-11-30', '2023-12-31',
  '2024-08-12', '2025-08-12', '2026-08-12', '2019-06-01',
  'not-a-date', '',
];

for (const fnName of FUNCTIONS) {
  test(`${fnName} carries a forceMisreadYear copy`, () => {
    if (loadEdgeCopy(fnName) === null) {
      throw new Error(
        `no forceMisreadYear found in supabase/functions/${fnName}/index.ts — ` +
        `the year repair is missing from this function entirely`,
      );
    }
  });

  test(`${fnName} agrees with src/lib/ocrYearFix.ts`, () => {
    const edge = loadEdgeCopy(fnName);
    if (!edge) return; // already reported by the test above

    for (const input of MATRIX) {
      const expected = forceOcrYear(input, { today: TODAY });
      const actual = edge(input, TODAY);
      if (actual !== expected) {
        throw new Error(
          `${fnName} drifted on "${input}": client says ${JSON.stringify(expected)}, ` +
          `edge copy says ${JSON.stringify(actual)}`,
        );
      }
    }
  });
}

// The two constants must also match, or the copies would agree on today's
// matrix and diverge the moment either side is bumped.
test('every edge copy declares the same two year constants', () => {
  for (const fnName of FUNCTIONS) {
    const source = readFileSync(`supabase/functions/${fnName}/index.ts`, 'utf8');
    const misread = /OCR_MISREAD_YEAR\s*=\s*(\d{4})/.exec(source);
    const corrected = /OCR_CORRECTED_YEAR\s*=\s*(\d{4})/.exec(source);
    if (!misread || !corrected) {
      throw new Error(`${fnName} is missing one of the year constants`);
    }
    eq(`${fnName}:${misread[1]}`, `${fnName}:2023`);
    eq(`${fnName}:${corrected[1]}`, `${fnName}:2026`);
  }
});

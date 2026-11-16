/**
 * Tests for the email-a-statement parsing layer.
 *
 * This is the risky part of the feature: everything else is database writes
 * with explicit errors, but a misparsed reply fails QUIETLY — an edit that is
 * silently ignored looks identical to one that was applied, and the admin
 * confirms a statement they believe they corrected.
 *
 * The functions live in a Deno edge function that can't be imported from
 * Node, so they're extracted from source and compiled, the same trick
 * edgeFunctionSync.test.ts uses for the year repair.
 */

import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { test, eq } from './harness';

const SRC = readFileSync('supabase/functions/statement-email/index.ts', 'utf8');

function extract(name: string, kind: 'function' | 'const' = 'function'): string {
  const needle = kind === 'function' ? `function ${name}(` : `const ${name} =`;
  const start = SRC.indexOf(needle);
  if (start === -1) throw new Error(`${name} not found in statement-email`);
  if (kind === 'const') {
    const end = SRC.indexOf('\n', start);
    return SRC.slice(start, end);
  }
  // The body's opening brace is the LAST one on the signature line, not the
  // first: an inline object return type (`: { items: LineItem[] }`) puts a
  // brace ahead of it that would otherwise be mistaken for the body.
  const lineEnd = SRC.indexOf('\n', start);
  const open = SRC.lastIndexOf('{', lineEnd);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

// Pull the pure parsing layer out and compile it once.
const MODULE = (() => {
  const ts = [
    'interface LineItem { date: string; description: string; amount: number; }',
    'interface Directives { card?: string; periodStart?: string; periodEnd?: string;' +
      ' households?: string[]; confirm: boolean; cancel: boolean;' +
      ' edits: Array<{ index: number; item: LineItem }>; drops: number[];' +
      ' adds: LineItem[]; unknown: string[]; }',
    extract('TOKEN_RE', 'const'),
    extract('stripQuotedReply'),
    extract('parseAmount'),
    extract('parseDate'),
    extract('parseItemFields'),
    extract('parseDirectives'),
    extract('splitCsvRow'),
    extract('parseCsv'),
    extract('tokenFromSubject'),
    'export { stripQuotedReply, parseAmount, parseDate, parseDirectives, parseCsv, tokenFromSubject };',
  ].join('\n\n');
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code;
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports as {
    stripQuotedReply: (s: string) => string;
    parseAmount: (s: string) => number | null;
    parseDate: (s: string, y?: number) => string | null;
    parseDirectives: (s: string, y?: number) => Directives;
    parseCsv: (s: string, y?: number) => { items: LineItem[]; error?: string };
    tokenFromSubject: (s: string) => string | null;
  };
})();

interface LineItem { date: string; description: string; amount: number }
interface Directives {
  card?: string; periodStart?: string; periodEnd?: string; households?: string[];
  confirm: boolean; cancel: boolean;
  edits: Array<{ index: number; item: LineItem }>; drops: number[];
  adds: LineItem[]; unknown: string[];
}

const { stripQuotedReply, parseAmount, parseDate, parseDirectives, parseCsv, tokenFromSubject } = MODULE;

// ── Token ────────────────────────────────────────────────────────────────────
test('token is found in a reply subject, in any position or case', () => {
  eq(tokenFromSubject('[LX-7K3M9Q] Statement draft — Chase'), '7K3M9Q');
  eq(tokenFromSubject('Re: [LX-7K3M9Q] Statement draft'), '7K3M9Q');
  eq(tokenFromSubject('RES: Fwd: [lx-ab12cd] whatever'), 'AB12CD');
  eq(tokenFromSubject('statement'), null);
  eq(tokenFromSubject(''), null);
});

// ── The quoted-reply trap ────────────────────────────────────────────────────
// Without stripping, the draft table we just emailed parses as edit commands
// and the draft reapplies its own output — and a "confirm" sitting in the
// quoted instructions fires on a reply that never said it.
test('quoted reply text is cut before parsing', () => {
  const body = [
    'drop 3',
    '',
    'On Mon, 16 Nov 2026 at 09:14, LedgerX <notifications@ledger.90ten.life> wrote:',
    '> 1: 2026-10-02 | Shell | 48.10',
    '> confirm',
  ].join('\n');
  eq(stripQuotedReply(body).trim(), 'drop 3');
  const d = parseDirectives(body);
  eq(d.confirm, false);
  eq(d.drops.length, 1);
  eq(d.drops[0], 3);
});

test('quoting styles are all handled', () => {
  for (const marker of [
    '> quoted',
    '-----Original Message-----',
    '________________',
    'Em 16 de nov. de 2026, LedgerX escreveu:',
  ]) {
    const out = stripQuotedReply(`confirm\n\n${marker}\nconfirm`);
    eq(out.includes(marker), false);
  }
});

// ── Amounts ──────────────────────────────────────────────────────────────────
test('amounts parse in en and pt-BR formats, always positive', () => {
  eq(parseAmount('128.44'), 128.44);
  eq(parseAmount('$1,234.56'), 1234.56);
  eq(parseAmount('1.234,56'), 1234.56);      // pt-BR
  eq(parseAmount('R$ 45,00'), 45);
  eq(parseAmount('(32.10)'), 32.1);          // statements print credits this way
  eq(parseAmount('-32.10'), 32.1);
  eq(parseAmount(''), null);
  eq(parseAmount('abc'), null);
});

// ── Dates ────────────────────────────────────────────────────────────────────
test('dates parse ISO and US formats', () => {
  eq(parseDate('2026-10-14'), '2026-10-14');
  eq(parseDate('2026-1-5'), '2026-01-05');
  eq(parseDate('10/14/2026'), '2026-10-14');
  eq(parseDate('10/14/26'), '2026-10-14');
  eq(parseDate('not a date'), null);
});

test('a bare MM/DD takes its year from the billing period', () => {
  // The common statement case: the page prints 10/14 and nothing else.
  eq(parseDate('10/14', 2025), '2025-10-14');
});

// ── Directives ───────────────────────────────────────────────────────────────
test('metadata directives parse in both languages', () => {
  const en = parseDirectives('card: Chase Ink ...1234\nperiod: 2026-10-01 to 2026-10-31\nhouseholds: Beach House, Cabin');
  eq(en.card, 'Chase Ink ...1234');
  eq(en.periodStart, '2026-10-01');
  eq(en.periodEnd, '2026-10-31');
  eq(en.households!.join('|'), 'Beach House|Cabin');

  const pt = parseDirectives('cartão: Itaú ...9876\nperíodo: 2026-10-01 a 2026-10-31\npropriedades: Casa de Praia');
  eq(pt.card, 'Itaú ...9876');
  eq(pt.periodStart, '2026-10-01');
  eq(pt.periodEnd, '2026-10-31');
  eq(pt.households!.join('|'), 'Casa de Praia');
});

test('period accepts .. and dash separators too', () => {
  eq(parseDirectives('period: 2026-10-01 .. 2026-10-31').periodEnd, '2026-10-31');
  eq(parseDirectives('period: 2026-10-01 --> 2026-10-31').periodStart, '2026-10-01');
});

test('line edits, drops and adds parse', () => {
  const d = parseDirectives([
    '3: 2026-10-14 | Home Depot | 128.44',
    'drop 7, 9',
    'remove 11',
    'add: 2026-10-20 | Lowes | 45.00',
  ].join('\n'));
  eq(d.edits.length, 1);
  eq(d.edits[0].index, 3);
  eq(d.edits[0].item.description, 'Home Depot');
  eq(d.edits[0].item.amount, 128.44);
  eq(d.drops.join(','), '7,9,11');
  eq(d.adds.length, 1);
  eq(d.adds[0].date, '2026-10-20');
});

test('a description containing a pipe survives', () => {
  const d = parseDirectives('add: 2026-10-20 | AMZN Mktp | US*2X9 | 45.00');
  eq(d.adds[0].description, 'AMZN Mktp | US*2X9');
  eq(d.adds[0].amount, 45);
});

test('confirm and cancel are recognised in both languages', () => {
  eq(parseDirectives('confirm').confirm, true);
  eq(parseDirectives('CONFIRM').confirm, true);
  eq(parseDirectives('confirmar').confirm, true);
  eq(parseDirectives('cancel').cancel, true);
  eq(parseDirectives('cancelar').cancel, true);
});

test('a bare "confirm" inside prose does NOT confirm', () => {
  // Only a line that is exactly the word counts, so "I'll confirm later"
  // cannot save a statement by accident.
  eq(parseDirectives('I will confirm later once I check the total').confirm, false);
});

test('unparseable lines are collected, never silently dropped', () => {
  const d = parseDirectives('card: Chase\nthis line makes no sense\n4: broken');
  eq(d.card, 'Chase');
  eq(d.unknown.length, 2);
});

// ── CSV ──────────────────────────────────────────────────────────────────────
test('CSV is parsed by header name, not column position', () => {
  const csv = [
    'Some Bank Export',
    '',
    'Posting Date,Description,Amount,Balance',
    '10/14/2026,"HOME DEPOT #123",128.44,900.00',
    '10/20/2026,"LOWES",45.00,855.00',
  ].join('\n');
  const r = parseCsv(csv);
  eq(r.items.length, 2);
  eq(r.items[0].date, '2026-10-14');
  eq(r.items[0].description, 'HOME DEPOT #123');
  eq(r.items[0].amount, 128.44);
});

test('CSV with reordered columns still maps correctly', () => {
  const csv = 'Amount,Merchant,Date\n128.44,Home Depot,2026-10-14';
  const r = parseCsv(csv);
  eq(r.items.length, 1);
  eq(r.items[0].description, 'Home Depot');
  eq(r.items[0].amount, 128.44);
});

test('CSV with no recognisable header reports instead of guessing', () => {
  const r = parseCsv('a,b,c\n1,2,3');
  eq(r.error, 'no-header');
  eq(r.items.length, 0);
});

test('quoted CSV commas do not split a field', () => {
  const r = parseCsv('Date,Description,Amount\n2026-10-14,"ACME, INC",12.00');
  eq(r.items[0].description, 'ACME, INC');
  eq(r.items[0].amount, 12);
});

import Papa from 'papaparse';

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Parses a CSV file client-side. First row is treated as the header row. */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const data = result.data;
        if (!data || data.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }
        const [headers, ...rows] = data;
        resolve({ headers, rows });
      },
      error: (err: Error) => reject(err),
    });
  });
}

export interface ColumnMapping {
  dateCol: number;
  descriptionCol: number;
  amountCol: number;
  /** Some banks print charges as negative and credits/payments as positive — flip to normalize. */
  signFlip: boolean;
}

export interface DraftLineItem {
  line_date: string;
  description: string;
  amount: number | null;
}

// Accept ISO (already correct) or common US-style MM/DD/YYYY input; anything
// else is left unparsed for the user to fix by hand in the review table.
function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (us) {
    const [, m, d, yRaw] = us;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

/** Applies a column mapping to raw CSV rows, producing draft line items. */
export function applyColumnMapping(rows: string[][], mapping: ColumnMapping): DraftLineItem[] {
  return rows.map((row) => {
    const rawAmount = (row[mapping.amountCol] ?? '').replace(/[^0-9.-]/g, '');
    let amount = rawAmount ? parseFloat(rawAmount) : NaN;
    if (!Number.isNaN(amount) && mapping.signFlip) amount = -amount;
    return {
      line_date: normalizeDate(row[mapping.dateCol] ?? ''),
      description: (row[mapping.descriptionCol] ?? '').trim(),
      amount: Number.isFinite(amount) ? amount : null,
    };
  });
}

/**
 * A row is importable only once it has a real date/description and a
 * positive amount. Rows normalize to zero/negative after sign correction
 * when they're actually a credit or payment, not a charge — those are
 * silently excluded rather than matched against expenses.
 */
export function isImportable(item: DraftLineItem): boolean {
  return !!item.line_date && !!item.description.trim() && item.amount != null && item.amount > 0;
}

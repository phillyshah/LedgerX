interface CsvExpense {
  id?: string;
  pic_id?: string | null;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string | null;
  category: string | null;
  household_id: string | null;
  notes: string | null;
  created_by?: string | null;
}

const csvField = (value: unknown) =>
  `"${value == null ? '' : String(value).replace(/"/g, '""')}"`;

export function buildExpenseCsv(
  expenses: CsvExpense[],
  householdNames: Map<string, string>,
  picIdField: 'id' | 'pic_id' = 'id',
  submitterNames?: Map<string, string>,
): string {
  const includeSubmitter = !!submitterNames;
  const header = [
    'Pic ID', 'Date', 'Vendor', 'Amount', 'Currency', 'Category', 'Household',
    ...(includeSubmitter ? ['Submitted by'] : []),
    'Notes',
  ].join(',');
  const rows = expenses.map((e) =>
    [
      csvField(picIdField === 'id' ? e.id : e.pic_id),
      csvField(e.expense_date),
      csvField(e.vendor),
      csvField(e.total),
      csvField(e.currency || 'USD'),
      csvField(e.category),
      csvField(householdNames.get(e.household_id ?? '') || ''),
      ...(includeSubmitter
        ? [csvField(submitterNames!.get(e.created_by ?? '') || '')]
        : []),
      csvField(e.notes),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

/** Generic CSV builder: a header row + string cells, RFC-4180 quoted. */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(csvField).join(',');
  const bodyLines = rows.map((r) => r.map(csvField).join(','));
  return [headerLine, ...bodyLines].join('\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

interface CsvExpense {
  id?: string;
  pic_id?: string | null;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string | null;
  category: string | null;
  household_id: string;
  notes: string | null;
}

const csvField = (value: unknown) => `"${value == null ? '' : String(value).replace(/"/g, '""')}"`;

// 8-column expense CSV used by both Reports and ExportData.
// `picIdField` selects which expense field becomes the "Pic ID" column.
export function buildExpenseCsv(
  expenses: CsvExpense[],
  householdNames: Map<string, string>,
  picIdField: 'id' | 'pic_id' = 'id',
): string {
  const header = ['Pic ID', 'Date', 'Vendor', 'Amount', 'Currency', 'Category', 'Household', 'Notes'].join(',');
  const rows = expenses.map((e) => [
    csvField(picIdField === 'id' ? e.id : e.pic_id),
    csvField(e.expense_date),
    csvField(e.vendor),
    csvField(e.total),
    csvField(e.currency || 'USD'),
    csvField(e.category),
    csvField(householdNames.get(e.household_id) || ''),
    csvField(e.notes),
  ].join(','));
  return [header, ...rows].join('\n');
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

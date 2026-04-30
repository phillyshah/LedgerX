// YYYY-MM-DD for today in local time. Avoids the UTC off-by-one bug
// you'd get from new Date().toISOString().slice(0, 10).
export function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Parse a YYYY-MM-DD expense_date string as a local-time Date.
// new Date('2025-01-01') would interpret it as UTC and shift the day in negative offsets.
export function parseExpenseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

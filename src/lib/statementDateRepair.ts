// Defends the statement OCR path against year digit-misreads (e.g. "2026"
// read as "2023" — a textbook 6→3 OCR swap). The statement's billing period
// is human-entered, trusted ground truth, and a far better signal than a
// blind "N months old" heuristic: if an extracted line item's date doesn't
// fall within the period, try re-pairing its month/day with whichever
// year(s) the period actually covers, and correct the year only if that
// lands the date back inside the period. Never force a guess otherwise —
// the review table stays the safety net for anything this can't resolve.

const GRACE_DAYS = 10;

export interface RepairableDateItem {
  line_date: string;
}

export interface RepairResult<T extends RepairableDateItem> {
  items: T[];
  repairedCount: number;
}

function toDate(dateString: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function isWithinWindow(date: Date, windowStart: Date, windowEnd: Date): boolean {
  return date.getTime() >= windowStart.getTime() && date.getTime() <= windowEnd.getTime();
}

/**
 * Corrects the year on OCR'd line items whose date falls outside the
 * statement's period (± a grace window), when re-pairing month/day with a
 * year the period actually covers lands the date back inside it. Items that
 * don't fit any candidate year, or that already fall in-window, pass
 * through unchanged.
 */
export function repairLineItemYears<T extends RepairableDateItem>(
  items: T[],
  periodStart: string,
  periodEnd: string
): RepairResult<T> {
  const start = toDate(periodStart);
  const end = toDate(periodEnd);
  if (!start || !end) return { items, repairedCount: 0 };

  const windowStart = new Date(start.getTime() - GRACE_DAYS * 86_400_000);
  const windowEnd = new Date(end.getTime() + GRACE_DAYS * 86_400_000);

  // Usually one year; occasionally two at a Dec/Jan billing-cycle boundary.
  const candidateYears = [...new Set([start.getFullYear(), end.getFullYear()])];

  let repairedCount = 0;

  const repaired = items.map((item) => {
    const original = toDate(item.line_date);
    if (!original) return item;
    if (isWithinWindow(original, windowStart, windowEnd)) return item;

    const month = original.getMonth();
    const day = original.getDate();

    for (const year of candidateYears) {
      if (year === original.getFullYear()) continue;
      const candidate = new Date(year, month, day);
      if (isWithinWindow(candidate, windowStart, windowEnd)) {
        repairedCount += 1;
        const yyyy = String(year).padStart(4, '0');
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return { ...item, line_date: `${yyyy}-${mm}-${dd}` };
      }
    }

    return item;
  });

  return { items: repaired, repairedCount };
}

/**
 * The two date ranges a month over month or year over year comparison sets
 * side by side. Pure civil-date arithmetic on "YYYY-MM-DD" strings, free of
 * database and tRPC imports; every range is half open, [start, end).
 */

export type ComparisonPeriod = "month" | "year";
export type DateRange = { start: string; end: string };

/**
 * `anchor` ("YYYY-MM" or "YYYY") against the period before it. A period still
 * running on `today` is taken to date, and so is the one it is compared with:
 * the 1st to the 11th of October against the 1st to the 11th of September,
 * rather than a third of a month against a whole one. A day the shorter month
 * does not have, the 30th against a February, takes the whole of that month.
 */
export function comparisonPeriods(
  period: ComparisonPeriod,
  anchor: string,
  today: string
): { toDate: boolean; current: DateRange; previous: DateRange } {
  const step = period === "month" ? { months: 1 } : { months: 12 };
  const start = period === "month" ? `${anchor}-01` : `${anchor}-01-01`;
  const next = addMonths(start, step.months);
  const tomorrow = addDays(today, 1);
  const toDate = start <= today && today < next;
  const end = toDate ? tomorrow : next;
  const previousStart = addMonths(start, -step.months);
  const previousEnd = toDate ? clampedBack(end, step.months, start) : start;

  return {
    toDate,
    current: { start, end },
    previous: { start: previousStart, end: previousEnd },
  };
}

/** `date` moved back `months`, kept within the period that ends at `cap`. */
function clampedBack(date: string, months: number, cap: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  // Past the end of a shorter month, the whole of that month is taken.
  const moved = day > lastDay ? addMonths(isoDay(target), 1) : isoDay(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)));
  return moved > cap ? cap : moved;
}

function addMonths(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number) as [number, number];
  return isoDay(new Date(Date.UTC(year, month - 1 + months, 1)));
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return isoDay(new Date(Date.UTC(year, month - 1, day + days)));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

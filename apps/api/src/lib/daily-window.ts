/**
 * The days the spending calendar counts for a year, as civil "YYYY-MM-DD"
 * dates: from 1 January, through today in the year still running and through
 * 31 December otherwise. Future-dated transactions fall outside it, since a
 * day that has not happened has no cell to be drawn in. A year that has not
 * begun on the server, which is what a browser a day ahead asks for on New
 * Year's Eve, is read as this one. Free of database and tRPC imports.
 */
export function dailyWindow(
  requested: number,
  today: string
): { year: number; start: string; until: string; through: string; days: number } {
  const year = Math.min(requested, Number(today.slice(0, 4)));
  const start = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const through = today < yearEnd ? today : yearEnd;
  const until = nextDay(through);
  return { year, start, until, through, days: (Date.parse(until) - Date.parse(start)) / 86_400_000 };
}

function nextDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

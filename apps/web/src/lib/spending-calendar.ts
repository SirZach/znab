/** One day in the spending calendar: its column (week), row (weekday) and spend. */
export type CalendarDay = { date: string; week: number; weekday: number; spent: number };

/**
 * Every day of `year` up to `today`, laid out as a calendar: a column per week
 * starting on Sunday, a row per weekday, and what was spent that day (zero
 * where `days`, which lists only days with something on them, has nothing).
 * Civil dates throughout, counted in UTC so no offset shifts a day.
 */
export function calendarDays(
  year: number,
  days: readonly { date: string; spent: number }[],
  today: string
): CalendarDay[] {
  const spentOn = new Map(days.map((d) => [d.date, d.spent]));
  const first = Date.UTC(year, 0, 1);
  const firstWeekday = new Date(first).getUTCDay();
  const out: CalendarDay[] = [];
  for (let t = first; new Date(t).getUTCFullYear() === year; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (date > today) break;
    const index = out.length;
    out.push({
      date,
      week: Math.floor((index + firstWeekday) / 7),
      weekday: new Date(t).getUTCDay(),
      spent: spentOn.get(date) ?? 0,
    });
  }
  return out;
}

/** The week column each month begins in, for labelling the calendar's axis. */
export function monthStarts(days: readonly CalendarDay[]): { week: number; month: string }[] {
  return days
    .filter((d) => d.date.endsWith("-01"))
    .map((d) => ({
      week: d.week,
      month: new Date(`${d.date}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    }));
}

/**
 * The spend at which a day reads as fully coloured: the 95th percentile of the
 * days that spent anything, so the mortgage day does not leave every other day
 * looking empty. Days above it are simply as dark as the scale goes.
 */
export function colorCeiling(spent: readonly number[]): number {
  const positive = spent.filter((s) => s > 0).sort((a, b) => a - b);
  if (positive.length === 0) return 1;
  return Math.max(1, positive[Math.min(positive.length - 1, Math.floor(positive.length * 0.95))]!);
}

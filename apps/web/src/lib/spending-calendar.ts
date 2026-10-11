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
 * How strongly a day is shaded, as a percentage of the theme's colour from 15
 * to 100, or null for a day with nothing spent or only refunds. Shaded by the
 * day's rank among the year's spending days rather than by its amount, since
 * spending is lopsided: in this budget three quarters of days spend under a
 * tenth of what the biggest do, so by amount nearly every day read alike.
 */
export function shadeFor(spent: readonly number[]): (value: number) => number | null {
  const sorted = spent.filter((s) => s > 0).sort((a, b) => a - b);
  return (value) => {
    if (value <= 0 || sorted.length === 0) return null;
    // The number of spending days at or below this one.
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! <= value) lo = mid + 1;
      else hi = mid;
    }
    const rank = sorted.length === 1 ? 1 : Math.max(0, lo - 1) / (sorted.length - 1);
    return Math.round(15 + 85 * rank);
  };
}

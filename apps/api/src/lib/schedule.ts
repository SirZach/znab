/**
 * YNAB 4's recurrence rules: how a scheduled transaction's frequency turns into
 * the dates it actually falls on. Deliberately free of database and tRPC
 * imports so the rules can be read, and tested, on their own.
 *
 * Every date here is a plain "YYYY-MM-DD" civil date, never a Date object. A
 * schedule falls on a calendar day rather than at an instant, and routing it
 * through Date would shift that day by the server's offset: the register
 * already writes `new Date(date + "T00:00:00")` to undo exactly that.
 */

import type { FrequencyValue } from "@znab/shared";

/** What the recurrence rules need of a scheduled transaction, and no more. */
export type Recurrence = {
  /** The next occurrence, and the seed the rest of the series is measured from. */
  date: string;
  frequency: FrequencyValue;
  /** For TwiceAMonth: the first of the month's two days. */
  twiceMonthDay?: number | null;
  /**
   * The day of the month the series means, for the frequencies that step in
   * months. It has to be carried separately from the date because the date is
   * written back every time an occurrence is entered, and a date that landed in
   * February was clamped on the way: read the day off that and a schedule due
   * on the 31st quietly becomes one due on the 28th, for good.
   */
  anchorDay?: number | null;
};

/** A civil date, pulled apart. `month` is 1-12, as people write it. */
type Civil = { year: number; month: number; day: number };

/** How many days each frequency steps by. Absent means it steps in months. */
const DAY_STEP: Partial<Record<FrequencyValue, number>> = {
  Daily: 1,
  Weekly: 7,
  EveryOtherWeek: 14,
  Every4Weeks: 28,
};

/** How many months each frequency steps by. Absent means it steps in days. */
const MONTH_STEP: Partial<Record<FrequencyValue, number>> = {
  Monthly: 1,
  EveryOtherMonth: 2,
  Every3Months: 3,
  Every4Months: 4,
  TwiceAYear: 6,
  Yearly: 12,
};

/**
 * The second of a TwiceAMonth pair sits fifteen days after the first. YNAB 4
 * asks only for the start day and puts the other occurrence half a month later.
 */
const TWICE_A_MONTH_GAP = 15;

/** A schedule that never comes round again: it happens once and is done. */
export function isOneOff(frequency: FrequencyValue): boolean {
  return frequency === "Once";
}

export function parseDate(iso: string): Civil {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Not a YYYY-MM-DD date: ${iso}`);
  }
  return { year, month, day };
}

export function formatDate({ year, month, day }: Civil): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Counting through months by hand keeps this free of Date and its offsets.
 * Civil dates in this form sort the way their strings do, which is what lets
 * every comparison below be a plain `<` or `>`.
 */
export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseDate(iso);
  let y = year;
  let m = month;
  let d = day + days;
  while (d > daysInMonth(y, m)) {
    d -= daysInMonth(y, m);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  while (d < 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    d += daysInMonth(y, m);
  }
  return formatDate({ year: y, month: m, day: d });
}

/**
 * Steps whole months, keeping the day of the month where it can. A schedule
 * anchored on the 31st has no 31st to land on in February and takes the last
 * day that month has. The anchor is passed separately so a series stepped from
 * a date that was itself clamped still knows the day it means.
 */
export function addMonths(iso: string, months: number, anchorDay?: number): string {
  const { year, month, day } = parseDate(iso);
  const anchor = anchorDay ?? day;
  const zeroBased = year * 12 + (month - 1) + months;
  const y = Math.floor(zeroBased / 12);
  const m = (zeroBased % 12) + 1;
  return formatDate({ year: y, month: m, day: Math.min(anchor, daysInMonth(y, m)) });
}

/**
 * The day of the month a month-stepping series means, which is the anchor when
 * one is carried and the date's own day when it is not. A schedule that has
 * never been entered has not been clamped yet, so its date still says.
 */
function anchorOf(recurrence: Recurrence): number {
  return recurrence.anchorDay || parseDate(recurrence.date).day;
}

/**
 * The start day of a TwiceAMonth pair. YNAB 4 writes `twiceAMonthStartDay: 0`
 * on every schedule that is not TwiceAMonth, and the importer stored that 0
 * rather than a null, so a zero here means "not set" and the schedule's own
 * date says which day it means.
 */
function startDay(recurrence: Recurrence): number {
  return recurrence.twiceMonthDay || parseDate(recurrence.date).day;
}

/** The two days of the month a TwiceAMonth schedule falls on, in order. */
function twiceAMonthDays(year: number, month: number, day: number): number[] {
  const last = daysInMonth(year, month);
  const first = Math.min(day, last);
  const second = Math.min(day + TWICE_A_MONTH_GAP, last);
  // A start day late enough that both land on the month's last day is one
  // occurrence, not two: the 30th of a 28-day February cannot come round twice.
  return first === second ? [first] : [first, second];
}

/**
 * Every date the schedule falls on from its own date up to and including
 * `through`, at most `cap` of them.
 *
 * The series is measured from the schedule's stored date, which is its next
 * occurrence, so the first date returned is always that one when it is in range.
 */
export function occurrencesThrough(
  recurrence: Recurrence,
  through: string,
  cap = 24,
): string[] {
  const { date, frequency } = recurrence;
  if (cap < 1 || date > through) return [];
  if (isOneOff(frequency)) return [date];

  const dates: string[] = [];

  const dayStep = DAY_STEP[frequency];
  if (dayStep) {
    for (let k = 0; dates.length < cap; k += 1) {
      const next = addDays(date, dayStep * k);
      if (next > through) break;
      dates.push(next);
    }
    return dates;
  }

  const monthStep = MONTH_STEP[frequency];
  if (monthStep) {
    const anchor = anchorOf(recurrence);
    for (let k = 0; dates.length < cap; k += 1) {
      const next = addMonths(date, monthStep * k, anchor);
      if (next > through) break;
      dates.push(next);
    }
    return dates;
  }

  if (frequency !== "TwiceAMonth") throw new Error(`Unknown frequency: ${frequency}`);

  // TwiceAMonth, the only frequency whose occurrences are not evenly spaced.
  const day = startDay(recurrence);
  for (let k = 0; dates.length < cap; k += 1) {
    const { year, month } = parseDate(addMonths(date, k, 1));
    for (const dayOfMonth of twiceAMonthDays(year, month, day)) {
      const next = formatDate({ year, month, day: dayOfMonth });
      if (next < date) continue;
      if (next > through || dates.length >= cap) return dates;
      dates.push(next);
    }
  }
  return dates;
}

/**
 * The first date the schedule falls on strictly after `after`, or null when it
 * never comes round again. This is what entering or skipping an occurrence
 * moves the schedule on to.
 */
export function nextOccurrence(recurrence: Recurrence, after: string): string | null {
  const { date, frequency } = recurrence;
  if (isOneOff(frequency)) return null;
  if (date > after) return date;

  const dayStep = DAY_STEP[frequency];
  if (dayStep) {
    // Jumping straight to the right multiple, rather than stepping one day at a
    // time, keeps a daily schedule left alone for years from looping thousands
    // of times to catch up.
    const steps = Math.floor(daysBetween(date, after) / dayStep) + 1;
    return addDays(date, dayStep * steps);
  }

  const monthStep = MONTH_STEP[frequency];
  if (monthStep) {
    const anchor = anchorOf(recurrence);
    const from = parseDate(date);
    const to = parseDate(after);
    const monthsApart = (to.year - from.year) * 12 + (to.month - from.month);
    let steps = Math.max(Math.floor(monthsApart / monthStep), 0);
    let next = addMonths(date, monthStep * steps, anchor);
    // Clamping can land a step short of `after`, so close the last gap by hand.
    while (next <= after) {
      steps += 1;
      next = addMonths(date, monthStep * steps, anchor);
    }
    return next;
  }

  if (frequency !== "TwiceAMonth") throw new Error(`Unknown frequency: ${frequency}`);

  const day = startDay(recurrence);
  // Two months is always enough: a pair falls in every single one of them.
  for (let k = 0; k <= 2; k += 1) {
    const { year, month } = parseDate(addMonths(after, k, 1));
    for (const dayOfMonth of twiceAMonthDays(year, month, day)) {
      const candidate = formatDate({ year, month, day: dayOfMonth });
      if (candidate > after) return candidate;
    }
  }
  return null;
}

/**
 * The first date on or after `from` that the series actually falls on.
 *
 * Only TwiceAMonth can be asked for a date that is not one of its own: every
 * other frequency defines its series from the date it is given. A schedule
 * whose date sits off its pair is invisible to `occurrencesThrough`, which
 * skips it, while the routines that enter one read the date directly, so it
 * would be entered on a day nothing ever showed as due. Snapping the date onto
 * the series when it is written keeps that from ever being stored.
 */
export function seriesStart(recurrence: Recurrence, from: string): string {
  if (recurrence.frequency !== "TwiceAMonth") return from;

  const day = startDay({ ...recurrence, date: from });
  for (let k = 0; k <= 1; k += 1) {
    const { year, month } = parseDate(addMonths(from, k, 1));
    for (const dayOfMonth of twiceAMonthDays(year, month, day)) {
      const candidate = formatDate({ year, month, day: dayOfMonth });
      if (candidate >= from) return candidate;
    }
  }
  return from;
}

/** Whole days from `from` to `to`, negative when `to` is the earlier one. */
export function daysBetween(from: string, to: string): number {
  return toOrdinal(parseDate(to)) - toOrdinal(parseDate(from));
}

/** Days since a fixed point, so two civil dates can simply be subtracted. */
function toOrdinal({ year, month, day }: Civil): number {
  // Shifting the year to start in March puts the leap day last, which makes the
  // month lengths run in a repeating pattern that needs no table.
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shifted = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shifted + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

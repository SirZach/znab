/**
 * Reading a date the way somebody types one into a register.
 *
 * Every transaction needs a date and almost every one is today or a day or two
 * either side, so the calendar was the slowest thing in the row: a popover and
 * a click to say something that is two keystrokes to type. This reads the short
 * forms people actually use and leaves the calendar where it was for the rest.
 *
 * Deliberately free of React so the rules can be read, and tested, on their own.
 */

/** A day, built in local time, the way every date in the register is read. */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

/** Whether the parts name a day the calendar actually has. */
function isReal(year: number, month: number, day: number): boolean {
  const d = localDate(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** Two digits mean this century, which is the only reading worth having. */
function fullYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

/**
 * What the reader meant, or null when it is not a date yet. Null is the answer
 * while someone is still typing, so the caller leaves the field alone rather
 * than fighting it.
 *
 * Understood, taking `today` as the day it is:
 *   `t`, `today`, `y`, `yesterday`, `tom`, `tomorrow`
 *   `-1`, `+3`          a number of days either side of today
 *   `18`                that day of the current month
 *   `9/18`, `9-18`      that day, this year
 *   `9/18/26`, `9/18/2026`
 *   `2026-09-18`        as the database writes it
 */
export function parseDateEntry(input: string, today = new Date()): Date | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  if (text === "t" || text === "today") return localDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  if (text === "y" || text === "yesterday") return offsetDays(today, -1);
  if (text === "tom" || text === "tomorrow") return offsetDays(today, 1);

  // A signed number is a number of days from today, which is how a receipt from
  // the weekend gets entered on a Monday.
  const signed = /^([+-])(\d{1,4})$/.exec(text);
  if (signed) {
    const days = Number(signed[2]);
    return offsetDays(today, signed[1] === "-" ? -days : days);
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return isReal(year, month, day) ? localDate(year, month, day) : null;
  }

  // Month and day, optionally a year, separated by either slash or dash.
  const parts = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(text);
  if (parts) {
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const year = parts[3] ? fullYear(Number(parts[3])) : today.getFullYear();
    return isReal(year, month, day) ? localDate(year, month, day) : null;
  }

  // A bare number is a day of the month being worked in.
  const dayOnly = /^(\d{1,2})$/.exec(text);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    return isReal(year, month, day) ? localDate(year, month, day) : null;
  }

  return null;
}

/** `days` either side of a date, keeping it local midnight. */
export function offsetDays(from: Date, days: number): Date {
  return localDate(from.getFullYear(), from.getMonth() + 1, from.getDate() + days);
}

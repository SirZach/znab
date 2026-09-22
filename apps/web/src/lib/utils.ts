import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a NUMERIC string from the DB as a dollar amount */
export function formatCurrency(amount: string | number | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/** Convert "MM/YYYY" (URL param) to "YYYY-MM-01" (DB date) */
export function monthParamToDate(month: string): string {
  const [mm, yyyy] = month.split("/");
  return `${yyyy}-${mm}-01`;
}

/** Convert "YYYY-MM-01" (DB date) to "MM/YYYY" (URL param) */
export function dateToMonthParam(date: string): string {
  const [yyyy, mm] = date.split("-");
  return `${mm}/${yyyy}`;
}

/** Get current month as "MM/YYYY" */
export function currentMonthParam(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  return `${mm}/${yyyy}`;
}

/** Format a date string "YYYY-MM-DD" for display */
export function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A date in the two shapes the app actually keeps asking for.
 *
 * Everything here deals in calendar days rather than instants, so both of these
 * take a day either as the string the API stores it as or as the Date a picker
 * hands back, and neither goes near a timezone. A string is taken apart rather
 * than parsed, because building a Date only to ask it what day it is invites
 * the shift off midnight the rest of the app spends its time undoing.
 */
function parts(date: Date | string): [string, string, string] {
  if (typeof date === "string") {
    const [year, month, day] = date.split("-");
    return [year!, month!, day!];
  }
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ];
}

/**
 * What a reader sees in a column: 11/11/2024.
 *
 * A register is mostly dates, and the long form above is wide enough that the
 * column wrapped to two lines, which costs more than a month name is worth when
 * every row carries one. Sentences keep the long form, where a date is read
 * once and reads better spelled out.
 */
export function formatDateShort(date: Date | string): string {
  const [year, month, day] = parts(date);
  return `${month}/${day}/${year}`;
}

/** What the API stores, and the only shape it accepts: 2024-11-11. */
export function formatDateISO(date: Date | string): string {
  const [year, month, day] = parts(date);
  return `${year}-${month}-${day}`;
}

/**
 * Evaluate what someone typed into a money field, YNAB 4 style: a plain number,
 * or arithmetic like `25+13`, `120/3`, `(40+5)*2`. A leading `=`, dollar signs
 * and thousands separators are all tolerated.
 *
 * Returns null for anything it can't read, so the caller can leave the field
 * alone rather than write a garbage amount. Deliberately a real parser and not
 * `eval`, since this evaluates text a user typed.
 */
export function parseAmountExpression(input: string): number | null {
  // Whitespace is skipped between tokens rather than stripped up front, so
  // `25 + 13` works while `12 34` is still rejected as two numbers run together.
  const src = input.replace(/[$,]/g, "").trim().replace(/^=/, "");
  if (!src) return null;

  let pos = 0;

  const skipSpace = () => {
    while (pos < src.length && /\s/.test(src[pos]!)) pos++;
  };
  const peek = () => {
    skipSpace();
    return src[pos];
  };

  // expr := term (('+' | '-') term)*
  function expr(): number | null {
    let left = term();
    if (left === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const right = term();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  // term := factor (('*' | '/') factor)*
  function term(): number | null {
    let left = factor();
    if (left === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = src[pos++];
      const right = factor();
      if (right === null) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  // factor := ('+' | '-') factor | '(' expr ')' | number
  function factor(): number | null {
    if (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const value = factor();
      if (value === null) return null;
      return op === "-" ? -value : value;
    }
    if (peek() === "(") {
      pos++;
      const value = expr();
      if (value === null || peek() !== ")") return null;
      pos++;
      return value;
    }
    skipSpace();
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos]!)) pos++;
    if (pos === start) return null;
    const value = Number(src.slice(start, pos));
    return Number.isFinite(value) ? value : null;
  }

  const result = expr();
  skipSpace();
  // Trailing junk (`25+`, `12 34`) means we misread it, so reject it.
  if (result === null || pos !== src.length || !Number.isFinite(result)) return null;

  return Math.round(result * 100) / 100;
}

/**
 * Add to or subtract from a budgeted amount without making the user do the sum
 * themselves. `typed` is read as a magnitude rather than a signed number, so
 * typing `-50` into the minus button still subtracts 50 rather than adding it:
 * the button already says what operation this is. Returns null for unreadable
 * input, matching how the rest of the app treats it: leave the amount alone.
 */
export function adjustAmount(value: number, op: "+" | "-", typed: string): number | null {
  const parsed = parseAmountExpression(typed);
  if (parsed === null) return null;
  const magnitude = Math.abs(parsed);
  const result = op === "+" ? value + magnitude : value - magnitude;
  return Math.round(result * 100) / 100;
}

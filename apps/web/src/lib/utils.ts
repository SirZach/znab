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

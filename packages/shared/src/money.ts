import { z } from "zod";

/**
 * Money is dollars on the wire and NUMERIC(12,2) in Postgres, which hands it
 * back as a string. Anything that adds or compares money converts to integer
 * cents first, because in floating point 0.1 + 0.2 is not 0.3.
 */

/** A money value as it arrives: a number, a NUMERIC string, or nothing. */
export type MoneyValue = string | number | null | undefined;

/**
 * Dollars to integer cents.
 *
 * - null, undefined, and anything that does not parse to a finite number
 *   (`""`, `"abc"`, NaN, Infinity) count as 0. A SQL SUM over no rows is null,
 *   and one unreadable amount should not turn a whole total into NaN.
 * - Strings are read with parseFloat, so `"-105.4400"` is -10544.
 * - Rounding is half away from zero, so `toCents(-x) === -toCents(x)`: -0.005
 *   is -1 cent, the mirror of 0.005. Values from the database never sit on a
 *   half cent, so this only matters for typed or computed input.
 * - Never returns -0.
 */
export function toCents(value: MoneyValue): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "");
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round(Math.abs(n) * 100) + 0;
}

/** Integer cents back to dollars. Never returns -0. */
export function fromCents(cents: number): number {
  return cents / 100 + 0;
}

/** A money value rounded to whole cents, in dollars. */
export function roundMoney(value: MoneyValue): number {
  return fromCents(toCents(value));
}

/** The largest magnitude a NUMERIC(12,2) column holds. */
export const MAX_MONEY = 9_999_999_999.99;

/**
 * A money amount from a client: finite, within NUMERIC(12,2), and already in
 * whole cents. A sub-cent value is refused rather than rounded, so the server
 * never stores a figure other than the one the client showed. The web rounds
 * everything it parses (`parseAmountExpression`) before sending it.
 */
export const moneySchema = z
  .number()
  .min(-MAX_MONEY)
  .max(MAX_MONEY)
  .refine((n) => roundMoney(n) === n, {
    message: "Amount must be in whole cents",
  });

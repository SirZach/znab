import { fromCents, type MoneyValue, toCents } from "./money";

/**
 * YNAB 4's reconciliation arithmetic, shared so the figure the web shows and
 * the figure the API decides on are worked out the same way. Both sums are in
 * integer cents: a hundredth of a cent of float drift is the difference between
 * finishing a reconciliation and being asked to adjust for nothing.
 */

/**
 * What the statement says the account holds, less what the account says it has
 * cleared: the amount an adjustment would have to add to make the two agree,
 * and exactly zero when they already do. Named arguments, since the two figures
 * are the same type and swapping them flips the sign.
 */
export function reconcileDifference({
  statementBalance,
  clearedBalance,
}: {
  statementBalance: MoneyValue;
  clearedBalance: MoneyValue;
}): number {
  return fromCents(toCents(statementBalance) - toCents(clearedBalance));
}

/** A register row, as much of one as reconciling needs to read. */
export type ReconcilableRow = {
  /** "YYYY-MM-DD", so plain string comparison puts these in order. */
  date: string;
  /** A postgres NUMERIC, so a string, though a number reads the same way. */
  amount: string | number;
  cleared: string;
};

/**
 * The account's cleared balance as it stood at the end of `statementDate`.
 *
 * `clearedBalance` is the cleared balance today, over the account's whole
 * history, so anything that has cleared since the statement closed comes back
 * off it. Working backwards from today beats adding up from the start: a
 * statement is nearly always a recent one, and the rows that have to be undone
 * are then the newest ones, which are the rows the register has loaded.
 *
 * Rows it has not loaded cannot be subtracted, so this is the figure to show a
 * reader and not the figure to reconcile against. The API works the same one
 * out over the full history and refuses a reconciliation that does not add up.
 * An unreadable amount counts as nothing (see `toCents`).
 */
export function clearedBalanceAsOf(
  clearedBalance: number,
  rows: readonly ReconcilableRow[],
  statementDate: string
): number {
  let total = toCents(clearedBalance);
  for (const row of rows) {
    // Uncleared rows were never in the cleared balance to take back off it.
    if (row.cleared !== "Uncleared" && row.date > statementDate) {
      total -= toCents(row.amount);
    }
  }
  return fromCents(total);
}

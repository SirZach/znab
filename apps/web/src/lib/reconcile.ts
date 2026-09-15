/**
 * Reconciling asks one question: does what the account says it has cleared
 * agree with what the statement says? The two figures behind that question are
 * worked out here rather than in the panel, so the number a reader is shown and
 * the number the Finish button decides on cannot disagree.
 *
 * Money is added up in integer cents, the way the API's budget maths does. A
 * hundredth of a cent of float drift is the difference between finishing a
 * reconciliation and being asked to enter an adjustment for nothing.
 */

/** A register row, as much of one as reconciling needs to read. */
export type ReconcilableRow = {
  /** "YYYY-MM-DD", so plain string comparison puts these in order. */
  date: string;
  /** A postgres NUMERIC, so a string, though a number reads the same way. */
  amount: string | number;
  cleared: string;
};

// An amount that cannot be read counts as nothing rather than poisoning the
// whole total with NaN, which would leave the panel showing no figures at all.
const cents = (value: string | number) => {
  const n = Math.round(parseFloat(String(value)) * 100);
  return Number.isFinite(n) ? n : 0;
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
 * reader and not the figure to reconcile against. The API works the same one out
 * over the full history and refuses a reconciliation that does not add up.
 */
export function clearedBalanceAsOf(
  clearedBalance: number,
  rows: readonly ReconcilableRow[],
  statementDate: string
): number {
  let total = cents(clearedBalance);
  for (const row of rows) {
    // Uncleared rows were never in the cleared balance to take back off it.
    if (row.cleared !== "Uncleared" && row.date > statementDate) {
      total -= cents(row.amount);
    }
  }
  return total / 100;
}

/**
 * What the statement says the account holds, less what the account says it has
 * cleared: the amount an adjustment would have to add to make the two agree, and
 * zero when they already do. Zero is the whole point of the exercise, which is
 * why the subtraction happens in cents.
 */
export function reconcileDifference(
  clearedBalance: number,
  statementBalance: number
): number {
  return (cents(statementBalance) - cents(clearedBalance)) / 100;
}

/**
 * Whether the rows the register has loaded are enough for the figure above to
 * be exact, rather than merely close.
 *
 * `clearedBalanceAsOf` takes cleared rows dated after the statement back off
 * the account's total, so it needs every one of them. The register holds a
 * window ending at the newest row, so the window covers the statement whenever
 * it reaches back past the statement's date, and trivially when there is
 * nothing older left to load. A cleared filter breaks it either way: the loaded
 * rows are then a subset chosen by status, and the ones left out are exactly
 * the ones that belong in this sum.
 *
 * When this is false the panel must say so rather than show a difference that
 * looks settled. Nothing unsound can be written either way, since the API works
 * the same figure out over the whole history and refuses what does not add up,
 * but a reader should not be told the account balances when it might not.
 */
export function coversStatement({
  statementDate,
  oldestLoadedDate,
  hasMore,
  clearedFilter,
}: {
  statementDate: string;
  oldestLoadedDate: string | undefined;
  hasMore: boolean;
  clearedFilter: string;
}): boolean {
  if (clearedFilter !== "all") return false;
  if (!hasMore) return true;
  if (!oldestLoadedDate) return false;
  return statementDate >= oldestLoadedDate;
}

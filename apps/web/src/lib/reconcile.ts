/**
 * Whether the rows the register has loaded are enough for `clearedBalanceAsOf`
 * (in @znab/shared) to be exact, rather than merely close.
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

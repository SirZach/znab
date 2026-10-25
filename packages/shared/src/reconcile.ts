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

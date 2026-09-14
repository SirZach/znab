/**
 * YNAB 4's transfer rules: what the two rows of a transfer carry, and how the
 * payee that stands in for an account is named. Deliberately free of database
 * and tRPC imports so the rules can be read, and tested, on their own.
 */

/** All either end of a transfer contributes to the rules below. */
export type TransferSide = { onBudget: boolean };

/**
 * The category one side of a transfer carries. Money moving between two
 * on-budget accounts has not left the budget, so it is spent nowhere and
 * categorised nowhere; money moving out to an off-budget account is spent, and
 * YNAB 4 records that against the on-budget side alone.
 */
export function transferCategoryId(
  side: TransferSide,
  other: TransferSide,
  categoryId: number | null,
): number | null {
  return side.onBudget && !other.onBudget ? categoryId : null;
}

/** The payee that stands in for an account, as YNAB 4 names it. */
export const transferPayeeName = (accountName: string): string => `Transfer : ${accountName}`;

/** And the id it gives that payee, so an authored one matches an imported one. */
export const transferPayeeYnabId = (accountYnabId: string): string =>
  `Payee/Transfer:${accountYnabId}`;

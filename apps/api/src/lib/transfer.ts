/**
 * YNAB 4's transfer rules: what the two rows of a transfer carry, and how the
 * payee that stands in for an account is named. Deliberately free of database
 * and tRPC imports so the rules can be read, and tested, on their own.
 */

import { transferCarriesCategory } from "@znab/shared";

/** All either end of a transfer contributes to the rules below. */
export type TransferSide = { onBudget: boolean };

/** The category one side of a transfer carries (see `transferCarriesCategory`). */
export function transferCategoryId(
  side: TransferSide,
  other: TransferSide,
  categoryId: number | null,
): number | null {
  return transferCarriesCategory(side, other) ? categoryId : null;
}

/** The payee that stands in for an account, as YNAB 4 names it. */
export const transferPayeeName = (accountName: string): string => `Transfer : ${accountName}`;

/** And the id it gives that payee, so an authored one matches an imported one. */
export const transferPayeeYnabId = (accountYnabId: string): string =>
  `Payee/Transfer:${accountYnabId}`;

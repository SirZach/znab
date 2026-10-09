/**
 * YNAB 4's reconciliation rules: what the balance adjustment that closes the
 * gap between a statement and the cleared balance carries. The gap itself is
 * `reconcileDifference` in @znab/shared. Deliberately free of database and
 * tRPC imports so the rules can be read, and tested, on their own.
 */

import { IMMEDIATE_INCOME } from "@znab/shared";

/** The payee YNAB 4 files a balance adjustment under. */
export const RECONCILE_PAYEE_NAME = "Reconciliation Balance Adjustment";

/** And the memo it leaves on it, naming whatever actually entered the row. */
export const RECONCILE_MEMO = "Entered automatically by znab";

/**
 * The balance adjustment for a difference the user has accepted. On an
 * on-budget account the difference is income the budget never saw, which is
 * what lands it in the month's To be Budgeted; a tracking account's money is
 * not budgeted at all, so nothing categorises it.
 */
export function balanceAdjustment(
  account: { onBudget: boolean },
  difference: number
): { amount: number; categoryYnabId: string | null } {
  return {
    amount: difference,
    categoryYnabId: account.onBudget ? IMMEDIATE_INCOME : null,
  };
}

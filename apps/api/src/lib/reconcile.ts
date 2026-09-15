/**
 * YNAB 4's reconciliation rules: what a statement leaves outstanding against
 * the cleared balance, and what the balance adjustment that closes the gap
 * carries. Deliberately free of database and tRPC imports so the rules can be
 * read, and tested, on their own.
 */

import { IMMEDIATE_INCOME } from "./budget-math";

/** The payee YNAB 4 files a balance adjustment under. */
export const RECONCILE_PAYEE_NAME = "Reconciliation Balance Adjustment";

/** And the memo it leaves on it, naming whatever actually entered the row. */
export const RECONCILE_MEMO = "Entered automatically by znab";

const cents = (v: string | number) => Math.round(parseFloat(String(v)) * 100);

/**
 * What the statement asserts, less what the register has cleared. Money is
 * numeric(12,2) and comes back from the database as a string, so the
 * subtraction is done in integer cents: in floating point 0.1 + 0.2 is not
 * 0.3, and a difference of a fraction of a cent would offer to adjust a
 * statement that already balances.
 */
export function reconcileDifference(
  statementBalance: string | number,
  clearedBalance: string | number
): number {
  return (cents(statementBalance) - cents(clearedBalance)) / 100;
}

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

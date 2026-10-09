/**
 * Small YNAB 4 rules both apps apply. Pure functions only: no database, tRPC
 * or React imports.
 */

import type { AccountType } from "./types";

/**
 * The account types the budget treats as debt rather than money in hand: a
 * balance in one is money owed.
 */
export const CREDIT_ACCOUNT_TYPES = [
  "CreditCard",
  "OtherLiability",
] as const satisfies readonly AccountType[];

/** Whether an account of this type holds debt. The column is free text. */
export function isCreditAccountType(accountType: string): boolean {
  return (CREDIT_ACCOUNT_TYPES as readonly string[]).includes(accountType);
}

/**
 * Whether one side of a transfer carries a category. Money moving between two
 * on-budget accounts has not left the budget, so it is categorised nowhere;
 * money moving out to an off-budget account is spent, and YNAB 4 records that
 * against the on-budget side alone. An account that is not known (not loaded
 * yet) answers no, since there is no telling which case this is.
 */
export function transferCarriesCategory(
  side: { onBudget: boolean } | undefined,
  other: { onBudget: boolean } | undefined
): boolean {
  return side?.onBudget === true && other?.onBudget === false;
}

/**
 * A schedule that never comes round again: it happens once and is done, so it
 * has nowhere to skip to. The column is free text.
 */
export function isOneOff(frequency: string): boolean {
  return frequency === "Once";
}

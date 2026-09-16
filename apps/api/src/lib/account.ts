/**
 * YNAB 4's rules for an account itself: where the balance it opens with is
 * filed, and how the pre-YNAB debt category that receives one is named.
 * Deliberately free of database and tRPC imports so the rules can be read, and
 * tested, on their own.
 */

import { IMMEDIATE_INCOME } from "./budget-math";

/** The payee YNAB 4 files an account's opening balance under. */
export const STARTING_BALANCE_PAYEE_NAME = "Starting Balance";

/** The system group every pre-YNAB debt category hangs off, and its name. */
export const PRE_YNAB_DEBT_GROUP_YNAB_ID = "MasterCategory/__PreYNABDebtMaster__";
export const PRE_YNAB_DEBT_GROUP_NAME = "Pre-YNAB Debt";

/**
 * The category inside that group standing for one account's opening debt. It
 * hangs off the account's own id, so there is exactly one per account, and it
 * is named after the account.
 */
export const preYnabDebtCategoryYnabId = (accountYnabId: string): string =>
  `Category/PreYNABDebt/${accountYnabId}`;

/**
 * The account types the budget treats as debt rather than money in hand, which
 * is what separates credit overspending from cash overspending. Kept in step
 * with the CASE in the budget router's activity query.
 */
export const CREDIT_ACCOUNT_TYPES = ["CreditCard", "OtherLiability"] as const;

/** Which side of that split an account type falls, in the words the user sees. */
export const accountClass = (accountType: string): "credit" | "cash" =>
  (CREDIT_ACCOUNT_TYPES as readonly string[]).includes(accountType) ? "credit" : "cash";

/**
 * Where an account's opening balance is filed. Money already sitting in an
 * on-budget account is income the budget never saw, so it lands in To be
 * Budgeted; what is already owed on an on-budget credit account is pre-YNAB
 * debt, which YNAB 4 gives a category of its own so that paying it off is
 * budgeted for like anything else. A tracking account is not budgeted at all,
 * so nothing categorises what it opens with.
 *
 * It is the kind of account that decides this, not the amount. All 45 imported
 * opening balances agree: every on-budget credit account is filed under
 * pre-YNAB debt including the four that open at exactly zero, which a rule
 * reading the sign could not explain, and every other on-budget account is
 * filed as income.
 */
export function startingBalanceCategory(
  account: { onBudget: boolean; accountType: string },
  accountYnabId: string
): { categoryYnabId: string | null; preYnabDebt: boolean } {
  if (!account.onBudget) {
    return { categoryYnabId: null, preYnabDebt: false };
  }
  if (accountClass(account.accountType) === "credit") {
    return {
      categoryYnabId: preYnabDebtCategoryYnabId(accountYnabId),
      preYnabDebt: true,
    };
  }
  return { categoryYnabId: IMMEDIATE_INCOME, preYnabDebt: false };
}

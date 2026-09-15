// Shared domain types used across web and api

export const CLEARED_VALUES = ["Uncleared", "Cleared", "Reconciled"] as const;
export type ClearedValue = typeof CLEARED_VALUES[number];

/**
 * The statuses a client may put on a transaction itself. Reconciled is not one
 * of them: it means a statement was reconciled against, which only reconciling
 * an account can establish, and a row given it any other way would claim a
 * statement that never existed and could sit at any date at all.
 */
export const ASSIGNABLE_CLEARED_VALUES = ["Uncleared", "Cleared"] as const;
export type AssignableClearedValue = typeof ASSIGNABLE_CLEARED_VALUES[number];

export const ACCOUNT_TYPES = [
  "Checking",
  "Savings",
  "CreditCard",
  "Cash",
  "OtherLiability",
  "InvestmentAccount",
] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

export const FREQUENCY_VALUES = [
  "Once",
  "Daily",
  "Weekly",
  "EveryOtherWeek",
  "TwiceAMonth",
  "Every4Weeks",
  "Monthly",
  "EveryOtherMonth",
  "Every3Months",
  "Every4Months",
  "TwiceAYear",
  "Yearly",
] as const;
export type FrequencyValue = typeof FREQUENCY_VALUES[number];

// The operators YNAB 4 offers for payee rename rules. Only "Is" appears in the
// real exports, but the UI can author the other three, so the vocabulary is
// carried whole.
export const PAYEE_RENAME_OPERATORS = ["Is", "Contains", "StartsWith", "EndsWith"] as const;
export type PayeeRenameOperator = typeof PAYEE_RENAME_OPERATORS[number];

// Special YNAB category IDs that aren't real categories. Pre-YNAB-debt
// categories (Category/PreYNABDebt/<accountId>) are intentionally NOT here:
// they are real categories imported under the Pre-YNAB Debt master group, so
// their id must resolve like any other category.
export const SPECIAL_CATEGORY_IDS = new Set([
  "Category/__ImmediateIncome__",
  "Category/__DeferredIncome__",
  "Category/__Split__",
]);

export function isSpecialCategoryId(id: string): boolean {
  return SPECIAL_CATEGORY_IDS.has(id);
}

// Hard-coded user slugs
export const USER_SLUGS = {
  ZACH: "zach",
  DEMO: "demo",
} as const;

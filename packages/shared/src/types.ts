// Shared domain types used across web and api

export const CLEARED_VALUES = ["Uncleared", "Cleared", "Reconciled"] as const;
export type ClearedValue = typeof CLEARED_VALUES[number];

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

// Special YNAB category IDs that aren't real categories
export const SPECIAL_CATEGORY_IDS = new Set([
  "Category/__ImmediateIncome__",
  "Category/__DeferredIncome__",
  "Category/__Split__",
]);

export function isSpecialCategoryId(id: string): boolean {
  return (
    SPECIAL_CATEGORY_IDS.has(id) || id.startsWith("Category/PreYNABDebt/")
  );
}

// Hard-coded user slugs
export const USER_SLUGS = {
  ZACH: "zach",
  DEMO: "demo",
} as const;

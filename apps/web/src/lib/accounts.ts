import { ACCOUNT_TYPES, type AccountType, isCreditAccountType } from "@znab/shared";

/**
 * The stored type as YNAB 4 writes it. Only the run-together ones need saying
 * differently, so anything else is shown as it is stored.
 */
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CreditCard: "Credit Card",
  OtherLiability: "Other Liability",
  InvestmentAccount: "Investment",
};

/**
 * The three sections a budget's accounts are read in. A hidden account is one
 * YNAB 4 calls closed: paid off or emptied, kept for its history. It belongs in
 * its own section rather than mixed in with the accounts still in use.
 *
 * Shared by the sidebar and the manage screen so they cannot disagree about
 * where an account belongs.
 */
export function groupAccounts<T extends { onBudget: boolean; hidden: boolean }>(
  accounts: T[]
) {
  const live = accounts.filter((a) => !a.hidden);
  return {
    onBudgetAccounts: live.filter((a) => a.onBudget),
    trackingAccounts: live.filter((a) => !a.onBudget),
    closedAccounts: accounts.filter((a) => a.hidden),
  };
}

export const TRACKING_NOTE =
  "A tracking account is for money you do not budget, like a loan or an investment. Its balance counts towards net worth, but nothing in it is budgeted.";

export const accountTypeLabel = (accountType: string) =>
  ACCOUNT_TYPE_LABELS[accountType] ?? accountType;

/** The manage list's sections, in the sidebar's order, empty ones left out. */
export function accountSections<T extends { onBudget: boolean; hidden: boolean }>(accounts: T[]) {
  const { onBudgetAccounts, trackingAccounts, closedAccounts } = groupAccounts(accounts);
  return [
    { label: "Budget Accounts", accounts: onBudgetAccounts },
    { label: "Tracking Accounts", accounts: trackingAccounts },
    { label: "Closed Accounts", accounts: closedAccounts },
  ].filter((section) => section.accounts.length > 0);
}

/**
 * The types an account may be changed to. Moving into or out of the credit side
 * changes what its balance means, so the API refuses that once there is
 * anything on the books, and the other side is left out rather than offered and
 * then refused. `used` is the transaction count, null while it is unknown.
 */
export function accountTypeOptions(current: string, used: number | null): readonly AccountType[] {
  if (used === 0) return ACCOUNT_TYPES;
  return ACCOUNT_TYPES.filter((t) => isCreditAccountType(t) === isCreditAccountType(current));
}

export type AccountDraft = { accountType: AccountType; onBudget: boolean; note: string };
export type AccountPatch = Partial<AccountDraft>;

/** Only what the draft changed, since absent keys are left alone by the API. */
export function accountPatch(
  account: { accountType: string; onBudget: boolean; note: string | null },
  draft: AccountDraft
): { patch: AccountPatch; dirty: boolean } {
  const patch = {
    accountType: draft.accountType === account.accountType ? undefined : draft.accountType,
    onBudget: draft.onBudget === account.onBudget ? undefined : draft.onBudget,
    note: draft.note === (account.note ?? "") ? undefined : draft.note,
  };
  return { patch, dirty: Object.values(patch).some((v) => v !== undefined) };
}

import type { PayeeRenameOperator } from "@znab/shared";
import { parseAmountExpression } from "@/lib/utils";

/**
 * How many rows are drawn at a time. A budget carries around a thousand payees,
 * and searching narrows that to a handful, so the tail is only mounted if
 * someone actually scrolls for it.
 */
export const PAYEE_PAGE_SIZE = 100;

export const OPERATOR_LABELS: Record<PayeeRenameOperator, string> = {
  Is: "Is",
  Contains: "Contains",
  StartsWith: "Starts with",
  EndsWith: "Ends with",
};

/** Transfer payees mirror an account, so the payees screen may only look at them. */
export const TRANSFER_NOTE =
  "This is a transfer payee. It follows its account, so it cannot be renamed, merged or deleted here.";

/** The autofill fields of a payee as the manage list returns them. */
export type PayeeAutofillFields = {
  autofillCategoryId: number | null;
  /** A postgres NUMERIC, so a string. */
  autofillAmount: string | null;
  autofillMemo: string | null;
};

/**
 * The amount this payee really autofills, or null. An imported YNAB 4 budget
 * stores "0.0000" rather than nothing, so a zero is an absent amount, and every
 * reader goes through this so the badge and its tooltip cannot disagree.
 */
export function autofillAmount(payee: PayeeAutofillFields): number | null {
  if (payee.autofillAmount === null) return null;
  const amount = Number(payee.autofillAmount);
  return amount === 0 ? null : amount;
}

/**
 * Whether the payee carries real entry defaults. An imported YNAB 4 budget
 * stores an empty memo and a zero amount rather than nothing, so a plain null
 * check would mark almost every payee as autofilled.
 */
export function hasAutofill(payee: PayeeAutofillFields): boolean {
  return (
    payee.autofillCategoryId !== null ||
    autofillAmount(payee) !== null ||
    (payee.autofillMemo ?? "").trim() !== ""
  );
}

/** The payees whose name holds the search, ignoring case and edge spaces. */
export function filterPayees<T extends { name: string }>(payees: T[], search: string): T[] {
  const needle = search.trim().toLowerCase();
  return needle ? payees.filter((p) => p.name.toLowerCase().includes(needle)) : payees;
}

/** The count under the page title. */
export function payeeCountLabel(shown: number, total: number, searching: boolean): string {
  return searching ? `${shown} of ${total} payees` : `${total} payees`;
}

/** The tooltip on the rename rules badge. */
export function renameRulesTitle(count: number): string {
  return `${count} rename rule${count === 1 ? "" : "s"}`;
}

type MergeCandidate = { id: number; name: string; transactionCount: number };

/** The payees a merge folds away, and how many transactions they carry over. */
export function mergePlan<T extends MergeCandidate>(checked: T[], target: T | null) {
  const sources = checked.filter((p) => p.id !== target?.id);
  const moving = sources.reduce((n, p) => n + p.transactionCount, 0);
  return { sources, moving };
}

/** Spells out what a merge will do, or asks for the payee to keep. */
export function mergeSummary(
  target: { name: string } | null,
  sourceCount: number,
  moving: number
): string {
  if (!target) return "Choose which payee to keep.";
  return `Merge ${sourceCount} ${sourceCount === 1 ? "payee" : "payees"} into "${
    target.name
  }", moving ${moving} ${moving === 1 ? "transaction" : "transactions"}. The other names are removed.`;
}

/** The inspector's autofill fields as first shown. */
export type AutofillDraft = {
  /** The saved category is hidden, so the field starts empty and saving clears it. */
  savedCategoryHidden: boolean;
  categoryId: number | "";
  amount: string;
  memo: string;
};

/**
 * Hiding a category is a soft delete, so it leaves the picker and the API
 * refuses to store it. Seeding the field with an id nobody can see would show
 * "No category" while every save failed on the id still held in state, so the
 * stale one is dropped, the way register autofill already drops it. An empty
 * option list means the categories have not arrived yet, not that every
 * category is hidden; treating it as hidden would clear a perfectly good
 * category the moment anyone saved.
 */
export function autofillDraft(
  payee: PayeeAutofillFields,
  categoryOptions: readonly { id: number }[]
): AutofillDraft {
  const savedCategoryHidden =
    payee.autofillCategoryId !== null &&
    categoryOptions.length > 0 &&
    !categoryOptions.some((c) => c.id === payee.autofillCategoryId);
  return {
    savedCategoryHidden,
    categoryId: savedCategoryHidden ? "" : (payee.autofillCategoryId ?? ""),
    // The amount arrives as a NUMERIC string ("-25.0000"), which is not what
    // anyone wants to edit.
    amount: payee.autofillAmount === null ? "" : String(Number(payee.autofillAmount)),
    memo: payee.autofillMemo ?? "",
  };
}

/** A typed autofill amount: blank is no amount, and invalid is unreadable text. */
export function parseAutofillAmount(text: string): { value: number | null; invalid: boolean } {
  const trimmed = text.trim();
  const value = trimmed === "" ? null : parseAmountExpression(trimmed);
  return { value, invalid: trimmed !== "" && value === null };
}

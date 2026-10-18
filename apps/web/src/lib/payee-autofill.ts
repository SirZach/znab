/**
 * YNAB 4 remembers where a payee usually gets budgeted and what memo it
 * carries, and prefills the row when you pick that payee. The decision lives
 * here, pure and out of the register component, so it can be tested and so the
 * component only has to call setState with whatever comes back.
 *
 * The remembered amount is deliberately left out. It is only ever the last
 * amount YNAB 4 saw for the payee, which for most payees says nothing about
 * this one, and a prefilled figure is easy to save without reading.
 */

import type { TransactionCategoryId } from "@znab/shared";

/** The autofill fields of a payee, as `payee.list` returns them. */
export type PayeeAutofillSource = {
  autofillCategoryId: number | null;
  autofillMemo: string | null;
};

/** What the add-transaction row already holds, so autofill never overwrites typing. */
export type RegisterDraft = {
  categoryId: TransactionCategoryId | null;
  memo: string;
};

/** Only the fields autofill decided to fill. An absent key means leave it alone. */
export type PayeeAutofillPatch = {
  categoryId?: number;
  memo?: string;
};

export function payeeAutofillPatch(
  payee: PayeeAutofillSource,
  draft: RegisterDraft,
  selectableCategories: readonly { id: TransactionCategoryId }[]
): PayeeAutofillPatch {
  const patch: PayeeAutofillPatch = {};

  // The importer drops autofill categories that pointed at YNAB's special
  // income categories, and system groups never reach the picker. An id the
  // picker cannot show would leave the field looking blank while still
  // submitting a category the user never saw.
  const categoryId = payee.autofillCategoryId;
  if (
    draft.categoryId === null &&
    categoryId !== null &&
    selectableCategories.some((c) => c.id === categoryId)
  ) {
    patch.categoryId = categoryId;
  }

  // Most imported payees carry an empty memo rather than a null one.
  const memo = payee.autofillMemo?.trim() ?? "";
  if (memo !== "" && draft.memo === "") patch.memo = memo;

  return patch;
}

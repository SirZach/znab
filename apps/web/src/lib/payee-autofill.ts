/**
 * YNAB 4 remembers what a payee usually costs and where it usually gets
 * budgeted, and prefills the row when you pick that payee. The decision lives
 * here, pure and out of the register component, so it can be tested and so the
 * component only has to call setState with whatever comes back.
 */

/** The autofill fields of a payee, as `payee.list` returns them. */
export type PayeeAutofillSource = {
  autofillCategoryId: number | null;
  /** A postgres NUMERIC, so a string. Negative is outflow, positive is inflow. */
  autofillAmount: string | null;
  autofillMemo: string | null;
};

/** What the add-transaction row already holds, so autofill never overwrites typing. */
export type RegisterDraft = {
  categoryId: number | null;
  memo: string;
  outflow: string;
  inflow: string;
};

/** Only the fields autofill decided to fill. An absent key means leave it alone. */
export type PayeeAutofillPatch = {
  categoryId?: number;
  memo?: string;
  outflow?: string;
  inflow?: string;
};

export function payeeAutofillPatch(
  payee: PayeeAutofillSource,
  draft: RegisterDraft,
  selectableCategories: readonly { id: number }[]
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

  // Both money fields have to be untouched. Filling one half of a partly typed
  // amount would leave an outflow and an inflow set at once, which will not save.
  const amount = payee.autofillAmount === null ? NaN : Number(payee.autofillAmount);
  if (
    draft.outflow === "" &&
    draft.inflow === "" &&
    Number.isFinite(amount) &&
    amount !== 0
  ) {
    if (amount < 0) patch.outflow = Math.abs(amount).toFixed(2);
    else patch.inflow = amount.toFixed(2);
  }

  // Most imported payees carry an empty memo rather than a null one.
  const memo = payee.autofillMemo?.trim() ?? "";
  if (memo !== "" && draft.memo === "") patch.memo = memo;

  return patch;
}

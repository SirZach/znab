import { isIncomeCategoryId, type TransactionCategoryId } from "@znab/shared";

/**
 * The two columns a transaction's category is written to. Income has no
 * category row, so it lives in the ynab id alone; a real category clears that
 * id, or a row moved off income would go on counting as income.
 */
export function categoryColumns(categoryId: TransactionCategoryId | null) {
  return isIncomeCategoryId(categoryId)
    ? { categoryId: null, categoryYnabId: categoryId }
    : { categoryId, categoryYnabId: null };
}

/** The category row id worth checking for ownership, if there is one. */
export const categoryRowId = (categoryId: TransactionCategoryId | null | undefined) =>
  isIncomeCategoryId(categoryId) ? undefined : categoryId;

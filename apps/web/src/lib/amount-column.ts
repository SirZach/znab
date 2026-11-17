/**
 * Which money column Tab lands on once a category is picked. Most rows are
 * spending, so Outflow, but a category that usually takes money in (income, or
 * one whose latest row was an inflow, a refund category say) goes to Inflow.
 */

import { isIncomeCategoryId, type TransactionCategoryId } from "@znab/shared";

export type AmountColumn = "outflow" | "inflow";

/** A row already entered, as much of it as the decision reads. */
export type CategoryHistoryRow = {
  id: number;
  date: string;
  amount: string | number;
  categoryId: TransactionCategoryId | null;
};

export function amountColumnFor(
  categoryId: TransactionCategoryId | null,
  history: readonly CategoryHistoryRow[]
): AmountColumn {
  if (categoryId === null) return "outflow";
  if (isIncomeCategoryId(categoryId)) return "inflow";

  let latest: CategoryHistoryRow | undefined;
  for (const row of history) {
    if (row.categoryId !== categoryId || Number(row.amount) === 0) continue;
    if (!latest || row.date > latest.date || (row.date === latest.date && row.id > latest.id)) {
      latest = row;
    }
  }
  return latest && Number(latest.amount) > 0 ? "inflow" : "outflow";
}

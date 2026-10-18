import { DEFERRED_INCOME, IMMEDIATE_INCOME, type TransactionCategoryId } from "@znab/shared";

/** A category as a picker offers it, labelled with its group. */
export type CategoryOption = { id: number; label: string };

/** What the register's picker offers: the categories, and income ahead of them. */
export type RegisterCategoryOption = { id: TransactionCategoryId; label: string };

/** YNAB 4's two income categories, in the words its register uses. */
export const INCOME_OPTIONS: readonly RegisterCategoryOption[] = [
  { id: IMMEDIATE_INCOME, label: "Income for this month" },
  { id: DEFERRED_INCOME, label: "Income for next month" },
];

type CategoryGroupLike = {
  name: string;
  isSystem: boolean;
  categories: readonly { id: number; name: string }[];
};

/**
 * The register's picker hides system groups, and anything else that files
 * money ahead of time (a schedule, a payee's autofill) offers the same list.
 */
export function toCategoryOptions(
  groups: readonly CategoryGroupLike[] | undefined
): CategoryOption[] {
  return (
    groups
      ?.filter((g) => !g.isSystem)
      .flatMap((g) => g.categories.map((c) => ({ id: c.id, label: `${g.name}: ${c.name}` }))) ?? []
  );
}

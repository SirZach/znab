/** A category as a picker offers it, labelled with its group. */
export type CategoryOption = { id: number; label: string };

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

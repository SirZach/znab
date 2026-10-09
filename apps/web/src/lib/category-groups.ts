type Group = { id: number; isSystem: boolean; categories: readonly unknown[] };

/** What the delete confirm is asking about. */
export type DoomedCategory = { kind: "category" | "group"; id: number; name: string };

/**
 * Reordering and moving only ever concern the groups a person keeps, so the
 * system ones are taken out of both the order that is sent and the places a
 * category can be moved to.
 */
export const movableGroups = <G extends Group>(groups: readonly G[]) =>
  groups.filter((group) => !group.isSystem);

export const categoryCount = (groups: readonly Group[]) =>
  groups.reduce((n, g) => n + g.categories.length, 0);

/**
 * A group's neighbours among the movable groups, and where its categories may
 * move to. Up and down step between groups a person keeps, so a system group
 * sitting between two of them is stepped over rather than landed on, and a
 * system group has none.
 */
export function groupPlacement<G extends Group>(movable: readonly G[], group: G) {
  const g = movable.indexOf(group);
  return {
    up: g < 0 ? undefined : movable[g - 1],
    down: g < 0 ? undefined : movable[g + 1],
    targets: movable.filter((m) => m.id !== group.id),
  };
}

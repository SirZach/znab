/**
 * Ticks or unticks `id` in a report filter, where `undefined` means every one
 * of `allIds`. Ticking the last one back returns to `undefined`, so a URL never
 * spells out "all" by listing them, and the last one ticked stays ticked, since
 * a report of nothing is not something to filter to.
 */
export function toggleFilterId(
  selected: number[] | undefined,
  id: number,
  allIds: number[]
): number[] | undefined {
  const current = selected ?? allIds;
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  if (next.length === 0) return current;
  if (allIds.every((x) => next.includes(x))) return undefined;
  return allIds.filter((x) => next.includes(x));
}

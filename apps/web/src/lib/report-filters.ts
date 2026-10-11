/**
 * Ticks or unticks `id` in a report filter, where `undefined` means every one
 * of `allIds` and `[]` means none. Ticking the last one back returns to
 * `undefined`, so a URL never spells out "all" by listing them.
 */
export function toggleFilterId(
  selected: number[] | undefined,
  id: number,
  allIds: number[]
): number[] | undefined {
  const current = selected ?? allIds;
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  if (allIds.every((x) => next.includes(x))) return undefined;
  return allIds.filter((x) => next.includes(x));
}

/**
 * The "All" item: unticks everything when everything is ticked, so one can be
 * picked out on its own, and ticks everything otherwise.
 */
export function toggleAll(selected: number[] | undefined): number[] | undefined {
  return selected === undefined ? [] : undefined;
}

/** True when a filter has had everything unticked, so there is nothing to report. */
export const selectsNothing = (...filters: (number[] | undefined)[]) =>
  filters.some((ids) => ids?.length === 0);

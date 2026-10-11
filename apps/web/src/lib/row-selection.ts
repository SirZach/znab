/**
 * Multi-row selection by click, the gestures the register and the budget grid
 * share: shift-click takes everything between the anchor and here, ctrl or
 * cmd-click adds or drops a single row, and anything else starts again from
 * this row alone.
 */

export type RowSelection<Id> = {
  ids: ReadonlySet<Id>;
  /** The row a shift-click range is measured from. */
  anchor: Id | null;
};

/** The modifier keys of the click, as a mouse event carries them. */
export type SelectModifiers = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

export const emptySelection = <Id>(): RowSelection<Id> => ({ ids: new Set(), anchor: null });

/**
 * The selection after clicking `id`. `visibleIds` is every row on screen in the
 * order it appears, so a range and the screen agree on what lies between two
 * rows. A shift-click whose anchor is no longer on screen falls through to the
 * other gestures. A range keeps its anchor, so it can be stretched again.
 */
export function selectRows<Id>(
  current: RowSelection<Id>,
  id: Id,
  visibleIds: readonly Id[],
  { shiftKey, metaKey, ctrlKey }: SelectModifiers
): RowSelection<Id> {
  if (shiftKey && current.anchor !== null) {
    const from = visibleIds.indexOf(current.anchor);
    const to = visibleIds.indexOf(id);
    if (from !== -1 && to !== -1) {
      const [lo, hi] = from < to ? [from, to] : [to, from];
      return { ids: new Set(visibleIds.slice(lo, hi + 1)), anchor: current.anchor };
    }
  }
  if (metaKey || ctrlKey) {
    const ids = new Set(current.ids);
    if (!ids.delete(id)) ids.add(id);
    return { ids, anchor: id };
  }
  return { ids: new Set([id]), anchor: id };
}

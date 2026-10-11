import { describe, expect, test } from "bun:test";
import { emptySelection, type RowSelection, selectRows } from "./row-selection";

const visible = [1, 2, 3, 4, 5];
const plain = { shiftKey: false, metaKey: false, ctrlKey: false };
const shift = { ...plain, shiftKey: true };
const ctrl = { ...plain, ctrlKey: true };
const meta = { ...plain, metaKey: true };

const sel = (ids: number[], anchor: number | null): RowSelection<number> => ({
  ids: new Set(ids),
  anchor,
});
const idsOf = (s: RowSelection<number>) => [...s.ids].sort();

describe("selectRows", () => {
  test("a plain click selects that row alone and anchors there", () => {
    const next = selectRows(sel([1, 2], 1), 4, visible, plain);
    expect(idsOf(next)).toEqual([4]);
    expect(next.anchor).toBe(4);
  });

  test("shift-click takes the range from the anchor, either direction, keeping the anchor", () => {
    expect(idsOf(selectRows(sel([2], 2), 4, visible, shift))).toEqual([2, 3, 4]);
    const up = selectRows(sel([4], 4), 2, visible, shift);
    expect(idsOf(up)).toEqual([2, 3, 4]);
    expect(up.anchor).toBe(4);
  });

  test("shift-click with no anchor acts as a plain click", () => {
    const next = selectRows(emptySelection<number>(), 3, visible, shift);
    expect(idsOf(next)).toEqual([3]);
    expect(next.anchor).toBe(3);
  });

  test("shift-click whose anchor is off screen falls through to a plain click", () => {
    const next = selectRows(sel([9], 9), 3, visible, shift);
    expect(idsOf(next)).toEqual([3]);
  });

  test("ctrl or cmd-click toggles one row and moves the anchor", () => {
    const added = selectRows(sel([1], 1), 3, visible, ctrl);
    expect(idsOf(added)).toEqual([1, 3]);
    expect(added.anchor).toBe(3);
    const dropped = selectRows(added, 1, visible, meta);
    expect(idsOf(dropped)).toEqual([3]);
    expect(dropped.anchor).toBe(1);
  });

  test("does not mutate the selection it was given", () => {
    const before = sel([1], 1);
    selectRows(before, 2, visible, ctrl);
    expect(idsOf(before)).toEqual([1]);
  });
});

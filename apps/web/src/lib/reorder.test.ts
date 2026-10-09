import { describe, expect, test } from "bun:test";
import { swapIds } from "./reorder";

const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

describe("swapIds", () => {
  test("swaps neighbours and leaves the rest in place", () => {
    expect(swapIds(items, 2, 3)).toEqual([1, 3, 2, 4]);
    expect(swapIds(items, 3, 2)).toEqual([1, 3, 2, 4]);
  });

  test("swaps a pair that sits apart in the whole order", () => {
    // A group of accounts is a slice of the one order, so its neighbours may
    // not be next to each other in the full list.
    expect(swapIds(items, 1, 4)).toEqual([4, 2, 3, 1]);
  });

  test("leaves the list it was given alone", () => {
    swapIds(items, 1, 2);
    expect(items.map((i) => i.id)).toEqual([1, 2, 3, 4]);
  });
});

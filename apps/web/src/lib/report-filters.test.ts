import { describe, expect, test } from "bun:test";
import { toggleAll, toggleFilterId } from "./report-filters";

const all = [1, 2, 3];

describe("toggleFilterId", () => {
  test("unticking one of all leaves the rest", () => {
    expect(toggleFilterId(undefined, 2, all)).toEqual([1, 3]);
  });

  test("ticking one adds it", () => {
    expect(toggleFilterId([1], 3, all)).toEqual([1, 3]);
  });

  test("ticking the last one back is all again", () => {
    expect(toggleFilterId([1, 3], 2, all)).toBeUndefined();
  });

  test("unticking the last one leaves none", () => {
    expect(toggleFilterId([2], 2, all)).toEqual([]);
  });

  test("ticking one from none is just that one", () => {
    expect(toggleFilterId([], 2, all)).toEqual([2]);
  });
});

describe("toggleAll", () => {
  test("from all, unticks every one", () => {
    expect(toggleAll(undefined)).toEqual([]);
  });

  test("from some or none, ticks every one", () => {
    expect(toggleAll([2])).toBeUndefined();
    expect(toggleAll([])).toBeUndefined();
  });
});

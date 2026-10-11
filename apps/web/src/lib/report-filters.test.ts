import { describe, expect, test } from "bun:test";
import { toggleFilterId } from "./report-filters";

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

  test("the last one ticked cannot be unticked, since none is not a filter", () => {
    expect(toggleFilterId([2], 2, all)).toEqual([2]);
  });
});

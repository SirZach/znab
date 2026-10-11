import { describe, expect, test } from "bun:test";
import { bulkDeleteNote, planBulkCategorise, planBulkCleared } from "./register-bulk";

const rows = [
  { id: 1, cleared: "Uncleared", locked: false },
  { id: 2, cleared: "Cleared", locked: true },
  { id: 3, cleared: "Reconciled", locked: false },
];

describe("planBulkCategorise", () => {
  test("skips rows that cannot hold a category and says how many", () => {
    const plan = planBulkCategorise(rows, (r) => !r.locked);
    expect(plan.targets.map((r) => r.id)).toEqual([1, 3]);
    expect(plan.note).toBe("Categorised 2 of 3. 1 carry no category here and were left alone.");
  });

  test("says nothing of skipped rows when there are none", () => {
    expect(planBulkCategorise(rows, () => true).note).toBe("Categorised 3 of 3.");
  });
});

describe("planBulkCleared", () => {
  test("leaves out reconciled rows and rows already there", () => {
    const plan = planBulkCleared(rows, "Cleared");
    expect(plan.targets.map((r) => r.id)).toEqual([1]);
    expect(plan.note).toBe(
      "Marked 1 of 3 cleared. 1 are reconciled, which cannot be undone from the register."
    );
  });

  test("with nothing reconciled, only the count", () => {
    const plan = planBulkCleared(rows.slice(0, 2), "Uncleared");
    expect(plan.targets.map((r) => r.id)).toEqual([2]);
    expect(plan.note).toBe("Marked 1 of 2 uncleared.");
  });
});

test("bulkDeleteNote", () => {
  expect(bulkDeleteNote(4)).toBe("Deleting 4.");
});

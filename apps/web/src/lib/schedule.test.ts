import { describe, expect, test } from "bun:test";
import { FREQUENCY_LABELS, behindLabel, upcomingRows } from "./schedule";
import { FREQUENCY_VALUES } from "@znab/shared";

/** One occurrence, named the way the register reads it. */
const occurrence = (
  scheduledTransactionId: number,
  date: string,
  due: boolean,
  frequency: (typeof FREQUENCY_VALUES)[number] = "Monthly",
) => ({
  scheduledTransactionId,
  date,
  due,
  payeeName: "Verizon Fios",
  categoryName: "Internet",
  isTransfer: false,
  amount: "-99.99",
  frequency,
});

describe("FREQUENCY_LABELS: every frequency has words for it", () => {
  test("none of the twelve is left unlabelled", () => {
    for (const value of FREQUENCY_VALUES) {
      expect(FREQUENCY_LABELS[value]).toBeTruthy();
    }
  });
});

describe("behindLabel: said only when a schedule is behind by more than one", () => {
  test("nothing due, or one occurrence due, says nothing", () => {
    expect(behindLabel(0)).toBeNull();
    expect(behindLabel(1)).toBeNull();
  });

  test("more than one says how many", () => {
    expect(behindLabel(8)).toBe("8 occurrences due");
  });
});

describe("upcomingRows: one actionable row per schedule, however far behind", () => {
  test("nothing in, nothing out", () => {
    expect(upcomingRows([])).toEqual([]);
  });

  test("a single due occurrence is enterable and says nothing about being behind", () => {
    const rows = upcomingRows([occurrence(1, "2026-09-01", true)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.enterable).toBe(true);
    expect(rows[0]!.behind).toBeNull();
  });

  test("a schedule missed many times is one row, not many dead ones", () => {
    const rows = upcomingRows([
      occurrence(1, "2026-02-09", true),
      occurrence(1, "2026-03-09", true),
      occurrence(1, "2026-04-09", true),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe("2026-02-09");
    expect(rows[0]!.enterable).toBe(true);
    expect(rows[0]!.behind).toBe("3 occurrences due");
  });

  test("occurrences still to come are listed, but cannot be entered out of turn", () => {
    // Entering the first is what moves the schedule on to the second, so only
    // the first carries buttons.
    const rows = upcomingRows([
      occurrence(1, "2026-09-01", true),
      occurrence(1, "2026-10-01", false),
      occurrence(1, "2026-11-01", false),
    ]);
    expect(rows.map((r) => [r.date, r.enterable])).toEqual([
      ["2026-09-01", true],
      ["2026-10-01", false],
      ["2026-11-01", false],
    ]);
  });

  test("a schedule with nothing due yet still offers its next occurrence", () => {
    // YNAB 4 lets an upcoming one be entered early, and the API enters whatever
    // occurrence the schedule is standing on.
    const rows = upcomingRows([occurrence(1, "2026-12-01", false)]);
    expect(rows[0]!.enterable).toBe(true);
  });

  test("several schedules each keep their own first row", () => {
    const rows = upcomingRows([
      occurrence(1, "2026-09-01", true),
      occurrence(2, "2026-09-02", true),
      occurrence(1, "2026-10-01", true),
      occurrence(2, "2026-10-02", false),
    ]);
    expect(rows.map((r) => [r.scheduledTransactionId, r.date, r.enterable])).toEqual([
      [1, "2026-09-01", true],
      [2, "2026-09-02", true],
      [2, "2026-10-02", false],
    ]);
    expect(rows[0]!.behind).toBe("2 occurrences due");
    expect(rows[1]!.behind).toBeNull();
  });

  test("the order it was given is the order it keeps", () => {
    const rows = upcomingRows([
      occurrence(3, "2026-09-01", true),
      occurrence(1, "2026-09-05", false),
      occurrence(2, "2026-09-09", false),
    ]);
    expect(rows.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-05", "2026-09-09"]);
  });
});

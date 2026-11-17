import { describe, expect, test } from "bun:test";
import { DEFERRED_INCOME, IMMEDIATE_INCOME } from "@znab/shared";
import { amountColumnFor, type CategoryHistoryRow } from "./amount-column";

const row = (fields: Partial<CategoryHistoryRow>): CategoryHistoryRow => ({
  id: 1,
  date: "2026-10-01",
  amount: "-10.00",
  categoryId: 5,
  ...fields,
});

describe("amountColumnFor", () => {
  test("no category, or one never used, goes to Outflow", () => {
    expect(amountColumnFor(null, [row({ amount: "10.00" })])).toBe("outflow");
    expect(amountColumnFor(9, [row({ amount: "10.00" })])).toBe("outflow");
  });

  test("income for this month or next goes to Inflow", () => {
    expect(amountColumnFor(IMMEDIATE_INCOME, [])).toBe("inflow");
    expect(amountColumnFor(DEFERRED_INCOME, [])).toBe("inflow");
  });

  test("the category's latest row decides", () => {
    const refunds = [
      row({ id: 1, date: "2026-09-01", amount: "-20.00" }),
      row({ id: 2, date: "2026-10-01", amount: "15.00" }),
    ];
    expect(amountColumnFor(5, refunds)).toBe("inflow");
    expect(amountColumnFor(5, [...refunds, row({ id: 3, date: "2026-10-02" })])).toBe("outflow");
  });

  test("a same day tie goes to the row entered last, and zero rows are ignored", () => {
    const rows = [
      row({ id: 4, amount: 12 }),
      row({ id: 3, amount: -12 }),
      row({ id: 5, date: "2026-11-01", amount: "0.00" }),
    ];
    expect(amountColumnFor(5, rows)).toBe("inflow");
  });
});

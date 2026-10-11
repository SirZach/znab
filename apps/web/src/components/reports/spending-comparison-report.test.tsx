import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/router";
import { currentAnchor, stepAnchor } from "@/lib/comparison";
import { percentChange } from "./spending-comparison-report";

const URL = "/budgets/1/reports/spending-comparison";
const layout = { "budget.byId": { id: 1, name: "Household" }, "account.list": [], "category.list": [] };
const march = {
  period: "month",
  anchor: "2026-03",
  toDate: false,
  current: { start: "2026-03-01", end: "2026-04-01" },
  previous: { start: "2026-02-01", end: "2026-03-01" },
  rows: [
    { categoryId: 1, category: "Rent", group: "Bills", current: 200, previous: 0, change: 200 },
    { categoryId: 2, category: "Groceries", group: "Everyday", current: 70, previous: 50, change: 20 },
    { categoryId: 3, category: "Fun", group: "Everyday", current: 0, previous: 25, change: -25 },
  ],
  totals: { current: 270, previous: 75, change: 195 },
};

describe("percentChange", () => {
  test("is a share of what it was, signed as it moved", () => {
    expect(percentChange(70, 50)).toBe("+40%");
    expect(percentChange(0, 25)).toBe("-100%");
    expect(percentChange(-10, 40)).toBe("-125%");
    expect(percentChange(30, -10)).toBe("+400%");
  });

  test("is new only for spending where there was none, and blank otherwise", () => {
    expect(percentChange(20, 0)).toBe("new");
    expect(percentChange(-10, 0)).toBe("");
    expect(percentChange(0, 0)).toBe("");
  });
});

describe("SpendingComparisonReport", () => {
  test("an anchor for the other period, or one not begun, reads as now", async () => {
    for (const search of ["?period=year&anchor=2026-03", "?anchor=2099-01"]) {
      const { inputsTo, unmount } = await renderRoute(`${URL}${search}`, {
        fixtures: { ...layout, "report.spendingComparison": march },
      });
      await waitFor(() => expect(inputsTo("report.spendingComparison").length).toBe(1));
      const sent = inputsTo("report.spendingComparison")[0] as { period: "month" | "year"; anchor: string };
      expect(sent.anchor).toBe(currentAnchor(sent.period));
      unmount();
    }
  });

  test("compares each category across the two periods, with the change", async () => {
    await renderRoute(`${URL}?anchor=2026-03`, {
      fixtures: { ...layout, "report.spendingComparison": march },
    });

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Category",
      "Group",
      "February 2026",
      "March 2026",
      "Change",
      "%",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "RentBills$0.00$200.00+$200.00new",
      "GroceriesEveryday$50.00$70.00+$20.00+40%",
      "FunEveryday$25.00$0.00-$25.00-100%",
    ]);
    expect(screen.getByText("+$195.00 +260%")).toBeTruthy();
  });

  test("steps back a month, and switching to years starts from this year", async () => {
    const now = currentAnchor("month");
    const { inputsTo, router } = await renderRoute(URL, {
      fixtures: { ...layout, "report.spendingComparison": march },
    });
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Next month" })).toHaveProperty("disabled", true);

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ anchor: stepAnchor("month", now, -1) }));
    await waitFor(() =>
      expect(inputsTo("report.spendingComparison").at(-1)).toMatchObject({
        period: "month",
        anchor: stepAnchor("month", now, -1),
      })
    );

    await userEvent.click(screen.getByRole("button", { name: "Year" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ period: "year" }));
    await waitFor(() =>
      expect(inputsTo("report.spendingComparison").at(-1)).toMatchObject({
        period: "year",
        anchor: currentAnchor("year"),
      })
    );
  });
});

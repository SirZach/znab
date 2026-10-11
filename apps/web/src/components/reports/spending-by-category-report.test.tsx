import { describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/router";

const byCategory = {
  spending: [{ categoryId: 7, category: "Groceries", group: "Everyday", spent: 45 }],
  total: 45,
};
const groceries = {
  category: "Groceries",
  group: "Everyday",
  series: [
    { month: "2025-03", spent: 30 },
    { month: "2025-04", spent: 15 },
  ],
  total: 45,
};
const fixtures = {
  "budget.byId": { id: 1, name: "Household" },
  "account.list": [],
  "report.spendingByCategory": byCategory,
  "report.categorySpending": groceries,
};

describe("SpendingByCategoryReport", () => {
  test("a category opens its monthly spending in the same timeframe, in the URL, and back returns", async () => {
    const { inputsTo, router } = await renderRoute("/budgets/1/reports/spending", { fixtures });

    await userEvent.click(await screen.findByRole("button", { name: "This Year" }));
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));

    expect(await screen.findByText("Monthly average")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Groceries/ })).toBeTruthy();
    expect(screen.getByText("$22.50")).toBeTruthy();
    expect(router.state.location.search).toEqual({ category: 7 });
    await waitFor(() =>
      expect(inputsTo("report.categorySpending")).toEqual([{ budgetId: 1, categoryId: 7, timeframe: "thisYear" }])
    );

    await userEvent.click(screen.getByRole("button", { name: "All categories" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(router.state.location.search).toEqual({});
  });

  test("a link to a category opens straight into it", async () => {
    const { inputsTo } = await renderRoute("/budgets/1/reports/spending?category=7", { fixtures });

    expect(await screen.findByRole("heading", { name: /Groceries/ })).toBeTruthy();
    expect(inputsTo("report.categorySpending")).toEqual([{ budgetId: 1, categoryId: 7, timeframe: "last12" }]);
    expect(inputsTo("report.spendingByCategory")).toEqual([]);
  });
});

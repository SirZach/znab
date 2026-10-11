import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/router";

const URL = "/budgets/1/reports/average-spending";
const layout = { "budget.byId": { id: 1, name: "Household" }, "account.list": [], "category.list": [] };
const averages = {
  months: 12,
  firstMonth: "2025-10",
  spending: [
    { categoryId: 7, category: "Groceries", group: "Everyday", total: 6000, average: 500 },
    { categoryId: 8, category: "Fun", group: "Everyday", total: 1200, average: 100 },
  ],
  total: 7200,
  average: 600,
};

describe("AverageSpendingReport", () => {
  test("lists each category's monthly average and total, and the typical month", async () => {
    await renderRoute(URL, { fixtures: { ...layout, "report.averageSpending": averages } });

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "GroceriesEveryday$500.00$6,000.00",
      "FunEveryday$100.00$1,200.00",
    ]);
    expect(screen.getByText("$600.00")).toBeTruthy();
    expect(screen.getByText("12 since Oct '25")).toBeTruthy();
  });

  test("says when the timeframe has no complete month yet", async () => {
    await renderRoute(`${URL}?timeframe=thisYear`, {
      fixtures: {
        ...layout,
        "report.averageSpending": { months: 0, firstMonth: null, spending: [], total: 0, average: 0 },
      },
    });

    expect(await screen.findByText("No complete month in this timeframe yet.")).toBeTruthy();
  });

  test("a category opens its month by month spending under the same filters", async () => {
    const { router } = await renderRoute(`${URL}?timeframe=all`, {
      fixtures: {
        ...layout,
        "report.averageSpending": averages,
        "report.categorySpending": { category: "Groceries", group: "Everyday", series: [], total: 0 },
      },
    });

    await userEvent.click(await screen.findByRole("link", { name: "Groceries" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/budgets/1/reports/spending"));
    expect(router.state.location.search).toEqual({ timeframe: "all", category: 7 });
  });
});

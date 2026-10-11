import { describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTrpc } from "../../../test/trpc";
import { SpendingByCategoryReport } from "./spending-by-category-report";

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

describe("SpendingByCategoryReport", () => {
  test("a category opens its monthly spending in the same timeframe, and back returns", async () => {
    const { inputsTo } = renderWithTrpc(<SpendingByCategoryReport budgetId={1} />, {
      fixtures: {
        "report.spendingByCategory": byCategory,
        "report.categorySpending": groceries,
      },
    });

    await userEvent.click(await screen.findByRole("button", { name: "This Year" }));
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));

    expect(await screen.findByText("Monthly average")).toBeTruthy();
    expect(screen.getByText("$22.50")).toBeTruthy();
    await waitFor(() =>
      expect(inputsTo("report.categorySpending")).toEqual([
        { budgetId: 1, categoryId: 7, timeframe: "thisYear" },
      ])
    );

    await userEvent.click(screen.getByRole("button", { name: "All categories" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });
});

import { describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/router";

const account = (id: number, name: string, onBudget: boolean, hidden = false) => ({
  id,
  name,
  onBudget,
  hidden,
  balance: 0,
});
const fixtures = {
  "budget.byId": { id: 1, name: "Household" },
  "account.list": [
    account(1, "Checking", true),
    account(2, "Visa", true),
    account(3, "Brokerage", false),
    account(4, "Old Card", true, true),
  ],
  "category.list": [
    { id: 10, name: "Everyday", isSystem: false, categories: [{ id: 5, name: "Groceries", used: 1 }, { id: 6, name: "Fun", used: 1 }] },
    { id: 11, name: "Internal", isSystem: true, categories: [{ id: 7, name: "Hidden", used: 0 }] },
  ],
  "report.spendingByCategory": { spending: [], total: 0 },
  "report.netWorth": { series: [], summary: null },
};

const json = (value: unknown) => encodeURIComponent(JSON.stringify(value));

describe("ReportFilters", () => {
  test("a spending report offers budget accounts only, and unticking one narrows the report", async () => {
    const { inputsTo, router } = await renderRoute("/budgets/1/reports/spending", { fixtures });

    await userEvent.click(await screen.findByText("All accounts"));
    expect(await screen.findByRole("option", { name: "Checking" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Old Card" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Brokerage" })).toBeNull();

    await userEvent.click(screen.getByRole("option", { name: "Visa" }));

    await waitFor(() => expect(router.state.location.search).toEqual({ accounts: [1, 4] }));
    await waitFor(() =>
      expect(inputsTo("report.spendingByCategory").at(-1)).toMatchObject({ accountIds: [1, 4] })
    );
  });

  test("categories leave out YNAB 4's own groups", async () => {
    await renderRoute("/budgets/1/reports/spending", { fixtures });

    await userEvent.click(await screen.findByText("All categories"));
    expect(await screen.findByRole("option", { name: "Groceries" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Hidden" })).toBeNull();
  });

  test("Net Worth offers tracking accounts and no categories", async () => {
    await renderRoute("/budgets/1/reports/net-worth", { fixtures });

    await userEvent.click(await screen.findByText("All accounts"));
    expect(await screen.findByRole("option", { name: "Brokerage" })).toBeTruthy();
    expect(screen.queryByText("All categories")).toBeNull();
  });

  test("a link carries its filters into the report", async () => {
    const { inputsTo } = await renderRoute(
      `/budgets/1/reports/spending?timeframe=all&accounts=${json([2])}&categories=${json([5, 6])}`,
      { fixtures }
    );

    expect(await screen.findByText("Visa", { selector: "button span" })).toBeTruthy();
    expect(screen.getByText("2 categories")).toBeTruthy();
    expect(inputsTo("report.spendingByCategory")).toEqual([
      { budgetId: 1, timeframe: "all", accountIds: [2], categoryIds: [5, 6] },
    ]);
  });
});

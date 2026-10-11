import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/router";

const URL = "/budgets/1/reports/spending-by-payee";
const nothing = { spending: [], total: 0 };
const twoPayees = {
  spending: [
    { payeeId: 1, payee: "Landlord", spent: 1200 },
    { payeeId: 2, payee: "Grocer", spent: 345.6 },
  ],
  total: 1545.6,
};
const grocer = {
  payee: "Grocer",
  series: [
    { month: "2025-03", spent: 100 },
    { month: "2025-04", spent: 245.6 },
  ],
  total: 345.6,
};
const layout = { "budget.byId": { id: 1, name: "Household" }, "account.list": [] };

describe("SpendingByPayeeReport", () => {
  test("says so when nobody was paid", async () => {
    await renderRoute(URL, { fixtures: { ...layout, "report.spendingByPayee": nothing } });

    expect(await screen.findByText("Nobody was paid in this timeframe.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("lists every payee with what was spent, and the total", async () => {
    await renderRoute(URL, { fixtures: { ...layout, "report.spendingByPayee": twoPayees } });

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Landlord$1,200.00", "Grocer$345.60"]);
    expect(screen.getByText("$1,545.60")).toBeTruthy();
  });

  test("a timeframe button asks for that timeframe", async () => {
    const { inputsTo } = await renderRoute(URL, {
      fixtures: {
        ...layout,
        "report.spendingByPayee": (input: { timeframe: string }) =>
          input.timeframe === "thisYear" ? twoPayees : nothing,
      },
    });
    await screen.findByText("Nobody was paid in this timeframe.");

    await userEvent.click(screen.getByRole("button", { name: "This Year" }));

    expect(await screen.findByText("Landlord")).toBeTruthy();
    await waitFor(() =>
      expect(inputsTo("report.spendingByPayee")).toEqual([
        { budgetId: 1, timeframe: "last12" },
        { budgetId: 1, timeframe: "thisYear" },
      ])
    );
  });

  test("a payee opens its monthly spending in the same timeframe, in the URL, and back returns", async () => {
    const { inputsTo, router } = await renderRoute(URL, {
      fixtures: { ...layout, "report.spendingByPayee": twoPayees, "report.payeeSpending": grocer },
    });

    await userEvent.click(await screen.findByRole("button", { name: "This Year" }));
    await userEvent.click(await screen.findByRole("button", { name: "Grocer" }));

    expect(await screen.findByRole("heading", { name: /Grocer/ })).toBeTruthy();
    expect(screen.getByText("$172.80")).toBeTruthy();
    expect(screen.getByText("+$145.60 / mo")).toBeTruthy();
    expect(router.state.location.search).toEqual({ payee: 2 });
    await waitFor(() =>
      expect(inputsTo("report.payeeSpending")).toEqual([{ budgetId: 1, payeeId: 2, timeframe: "thisYear" }])
    );

    await userEvent.click(screen.getByRole("button", { name: "All payees" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(router.state.location.search).toEqual({});
  });

  test("a link to a payee opens straight into it", async () => {
    const { inputsTo } = await renderRoute(`${URL}?payee=2`, {
      fixtures: { ...layout, "report.payeeSpending": grocer },
    });

    expect(await screen.findByRole("heading", { name: /Grocer/ })).toBeTruthy();
    expect(inputsTo("report.payeeSpending")).toEqual([{ budgetId: 1, payeeId: 2, timeframe: "last12" }]);
    expect(inputsTo("report.spendingByPayee")).toEqual([]);
  });
});

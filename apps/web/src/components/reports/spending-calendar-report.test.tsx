import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/router";

const URL = "/budgets/1/reports/spending-calendar";
const layout = { "budget.byId": { id: 1, name: "Household" }, "account.list": [], "category.list": [] };
const year2025 = {
  year: 2025,
  through: "2025-12-31",
  days: [
    { date: "2025-03-10", spent: 55 },
    { date: "2025-07-04", spent: 60 },
    { date: "2025-12-31", spent: 90 },
  ],
  total: 205,
  daysInYear: 365,
  spendingDays: 3,
  biggest: { date: "2025-12-31", spent: 90 },
};

describe("SpendingCalendarReport", () => {
  test("draws the year and its totals", async () => {
    const { container } = await renderRoute(`${URL}?year=2025`, {
      fixtures: { ...layout, "report.dailySpending": year2025 },
    });

    expect(await screen.findByText("362 of 365")).toBeTruthy();
    expect(screen.getByText("$205.00")).toBeTruthy();
    expect(screen.getByText("$0.56")).toBeTruthy();
    expect(screen.getByText("$90.00 on Wed, Dec 31, 2025")).toBeTruthy();
    await waitFor(() => expect(container.querySelector('svg[aria-label="Spending each day of 2025"]')).toBeTruthy());
  });

  test("steps between years, and this year leaves the URL", async () => {
    const thisYear = new Date().getFullYear();
    const { inputsTo, router } = await renderRoute(URL, {
      fixtures: { ...layout, "report.dailySpending": year2025 },
    });
    await screen.findByText("362 of 365");
    expect(screen.getByRole("button", { name: "Next year" })).toHaveProperty("disabled", true);

    await userEvent.click(screen.getByRole("button", { name: "Previous year" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ year: thisYear - 1 }));
    await waitFor(() => expect(inputsTo("report.dailySpending").at(-1)).toMatchObject({ year: thisYear - 1 }));

    await userEvent.click(screen.getByRole("button", { name: "Next year" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  test("a selected day lists what was spent on it, and closing or changing year clears it", async () => {
    const day = {
      date: "2025-03-10",
      transactions: [
        { transactionId: 11, subTransactionId: null, accountId: 3, accountName: "Checking", payeeName: "Grocer", category: "Groceries", memo: "weekly", spent: 40 },
        { transactionId: 12, subTransactionId: null, accountId: 4, accountName: "Visa", payeeName: null, category: "Fun", memo: null, spent: 25 },
        { transactionId: 13, subTransactionId: null, accountId: 3, accountName: "Checking", payeeName: "Grocer", category: "Groceries", memo: "refund", spent: -10 },
      ],
      total: 55,
    };
    const { inputsTo, router } = await renderRoute(`${URL}?year=2025&day=2025-03-10`, {
      fixtures: { ...layout, "report.dailySpending": year2025, "report.dayTransactions": day },
    });

    const section = await screen.findByRole("region", { name: "Spending on Mon, Mar 10, 2025" });
    const rows = within(section).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "GrocerGroceriesCheckingweekly$40.00",
      "No payeeFunVisa$25.00",
      "GrocerGroceriesCheckingrefund-$10.00",
      "Total$55.00",
    ]);
    expect(within(section).getAllByRole("link", { name: "Grocer" })[0]?.getAttribute("href")).toContain(
      "/budgets/1/accounts/3"
    );
    expect(inputsTo("report.dayTransactions")).toEqual([{ budgetId: 1, date: "2025-03-10" }]);

    await userEvent.click(within(section).getByRole("button", { name: "Close day" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ year: 2025 }));

    await router.navigate({ to: ".", search: { year: 2025, day: "2025-03-10" } });
    await userEvent.click(await screen.findByRole("button", { name: "Previous year" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ year: 2024 }));
  });

  test("says so when nothing was spent", async () => {
    await renderRoute(`${URL}?year=2025`, {
      fixtures: {
        ...layout,
        "report.dailySpending": { ...year2025, days: [], total: 0, spendingDays: 0, biggest: null },
      },
    });
    expect(await screen.findByText("Nothing was spent in this year.")).toBeTruthy();
  });
});

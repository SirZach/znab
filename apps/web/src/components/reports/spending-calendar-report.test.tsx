import { describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/router";

const URL = "/budgets/1/reports/spending-calendar";
const layout = { "budget.byId": { id: 1, name: "Household" }, "account.list": [], "category.list": [] };
const year2025 = {
  year: 2025,
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

import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTrpc } from "../../../test/trpc";
import { SpendingByPayeeReport } from "./spending-by-payee-report";

const nothing = { spending: [], total: 0 };
const twoPayees = {
  spending: [
    { payeeId: 1, payee: "Landlord", spent: 1200 },
    { payeeId: 2, payee: "Grocer", spent: 345.6 },
  ],
  total: 1545.6,
};

describe("SpendingByPayeeReport", () => {
  test("says so when nobody was paid", async () => {
    renderWithTrpc(<SpendingByPayeeReport budgetId={1} />, {
      fixtures: { "report.spendingByPayee": nothing },
    });

    expect(await screen.findByText("Nobody was paid in this timeframe.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("lists every payee with what was spent, and the total", async () => {
    renderWithTrpc(<SpendingByPayeeReport budgetId={1} />, {
      fixtures: { "report.spendingByPayee": twoPayees },
    });

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Landlord$1,200.00", "Grocer$345.60"]);
    expect(screen.getByText("$1,545.60")).toBeTruthy();
  });

  test("a timeframe button asks for that timeframe", async () => {
    const { inputsTo } = renderWithTrpc(<SpendingByPayeeReport budgetId={1} />, {
      fixtures: {
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
});

import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatCurrency } from "@/lib/utils";
import { renderWithTrpc } from "../../../test/trpc";
import { BudgetGrid } from "./budget-grid";

const cat = (id: number, name: string, budgeted: number, activity: number) => ({
  id,
  name,
  groupId: 1,
  sortOrder: id,
  deletedAt: null,
  budgeted,
  activity,
  available: budgeted + activity,
  overspendKind: null,
  confined: false,
  goal: null,
});

const monthBudget = {
  summary: {
    notBudgeted: 0,
    overspentPrev: 0,
    income: 1000,
    budgeted: 150,
    budgetedFuture: 0,
    availableToBudget: 850,
  },
  groups: [
    {
      id: 1,
      name: "Bills",
      isSystem: false,
      deletedAt: null,
      categories: [cat(10, "Rent", 100, -100), cat(11, "Power", 50, -20)],
    },
    {
      id: 2,
      name: "Fun",
      isSystem: false,
      deletedAt: null,
      categories: [cat(20, "Games", 0, 0)],
    },
  ],
  hidden: [],
};

const fixtures = {
  "budget.monthBudget": monthBudget,
  "budget.quickBudget": null,
  "budget.categoryHistory": [],
  "budget.categoryTransactions": [],
};

function renderGrid() {
  const onMonthChange = mock();
  // A distinct budget per render, so the remembered collapsed groups of one
  // test do not leak into the next.
  const budgetId = Math.floor(Math.random() * 1e9);
  const view = renderWithTrpc(
    <BudgetGrid budgetId={budgetId} month="01/2026" onMonthChange={onMonthChange} />,
    { fixtures }
  );
  return { ...view, onMonthChange, budgetId };
}

// Scoped to the grid, since an open inspector names categories too.
const cell = (name: string) => within(screen.getByRole("table")).getByText(name);
const row = (name: string) => cell(name).closest("tr")!;

describe("BudgetGrid", () => {
  test("a group header shows its own totals", async () => {
    renderGrid();
    await screen.findByText("Rent");
    const header = within(screen.getByText("Bills").closest("tr")!);
    expect(header.getByText(formatCurrency(150))).toBeTruthy();
    expect(header.getByText(formatCurrency(-120))).toBeTruthy();
    expect(header.getByText(formatCurrency(30))).toBeTruthy();
  });

  test("collapsing a group hides its rows", async () => {
    renderGrid();
    await screen.findByText("Rent");
    await userEvent.click(screen.getByRole("button", { name: "Collapse Bills" }));
    expect(screen.queryByText("Rent")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand Bills" })).toBeTruthy();
  });

  test("month arrows ask for the neighbouring months", async () => {
    const { onMonthChange } = renderGrid();
    await screen.findByText("January 2026");
    const [prev, next] = screen.getByText("January 2026").parentElement!.querySelectorAll("button");
    await userEvent.click(prev!);
    await userEvent.click(next!);
    expect(onMonthChange.mock.calls).toEqual([["12/2025"], ["02/2026"]]);
  });

  test("a budgeted cell saves to its category and month", async () => {
    const { inputsTo, budgetId } = renderGrid();
    await screen.findByText("Rent");
    const input = within(row("Power")).getByRole("textbox", { name: "Budgeted amount" });
    await userEvent.click(input);
    await userEvent.keyboard("75{Enter}");
    expect(inputsTo("budget.setBudgeted")).toEqual([
      { budgetId, categoryId: 11, month: "2026-01-01", budgeted: 75 },
    ]);
  });

  test("shift-click selects the range between two rows", async () => {
    renderGrid();
    await screen.findByText("Rent");
    const user = userEvent.setup();
    await user.click(cell("Rent"));
    await user.keyboard("{Shift>}");
    await user.click(cell("Games"));
    await user.keyboard("{/Shift}");
    for (const name of ["Rent", "Power", "Games"]) {
      expect(row(name).getAttribute("aria-selected")).toBe("true");
    }
  });

  test("ctrl-click toggles a single row", async () => {
    renderGrid();
    await screen.findByText("Rent");
    const user = userEvent.setup();
    await user.click(cell("Rent"));
    await user.keyboard("{Control>}");
    await user.click(cell("Games"));
    await user.click(cell("Rent"));
    await user.keyboard("{/Control}");
    expect(row("Rent").getAttribute("aria-selected")).toBe("false");
    expect(row("Games").getAttribute("aria-selected")).toBe("true");
  });
});

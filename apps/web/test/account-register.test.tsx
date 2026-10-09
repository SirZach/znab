import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatDateISO } from "@/lib/utils";
import { renderRoute } from "./router";

// Checking is the register under test. Savings is on budget and Mortgage is
// not, which is the difference between a transfer that carries no category and
// one that does.
const accounts = [
  { id: 10, name: "Checking", onBudget: true, hidden: false, accountType: "checking", balance: 0 },
  { id: 11, name: "Savings", onBudget: true, hidden: false, accountType: "savings", balance: 0 },
  { id: 12, name: "Mortgage", onBudget: false, hidden: false, accountType: "mortgage", balance: 0 },
];

function row(over: Record<string, unknown>) {
  return {
    date: "2026-10-01",
    amount: "-12.00",
    payeeId: null,
    payee: null,
    categoryId: null,
    category: null,
    memo: null,
    flagColor: null,
    cleared: "Uncleared",
    isSplit: false,
    isTransfer: false,
    transferAccountId: null,
    transferTransactionId: null,
    counterpartCleared: null,
    runningBalance: 0,
    subTransactions: [],
    ...over,
  };
}

const transactions = [
  row({ id: 1, payeeId: 200, payee: { name: "Grocer" }, categoryId: 100, category: { name: "Food" } }),
  row({
    id: 2,
    amount: "-50.00",
    payeeId: 201,
    payee: { name: "Transfer : Savings" },
    isTransfer: true,
    transferAccountId: 11,
  }),
  row({
    id: 3,
    amount: "-900.00",
    payeeId: 202,
    payee: { name: "Transfer : Mortgage" },
    isTransfer: true,
    transferAccountId: 12,
  }),
];

const fixtures = {
  "budget.byId": { id: 1, name: "Household" },
  "account.list": accounts,
  "account.transactions": {
    transactions,
    balance: -962,
    clearedBalance: 0,
    unclearedBalance: -962,
    total: transactions.length,
    matches: transactions.length,
    counts: { all: 3, Uncleared: 3, Cleared: 0, Reconciled: 0 },
    hasMore: false,
  },
  "category.list": [
    { id: 1, name: "Everyday", isSystem: false, categories: [{ id: 100, name: "Food" }] },
  ],
  "payee.list": [
    { id: 200, name: "Grocer", targetAccountId: null },
    { id: 201, name: "Transfer : Savings", targetAccountId: 11 },
    { id: 202, name: "Transfer : Mortgage", targetAccountId: 12 },
  ],
  "scheduledTransaction.upcoming": [],
};

/** Open the register, then the row whose payee is `payee`, for editing. */
async function openRow(payee: string) {
  const rendered = await renderRoute("/budgets/1/accounts/10", { fixtures });
  const user = userEvent.setup();
  const tr = (await screen.findByText(payee)).closest("tr")!;
  await user.click(tr);
  await within(tr).findByLabelText("Memo");
  return { ...rendered, user, tr };
}

describe("register row editing", () => {
  test("Outflow takes arithmetic, and Enter saves it as one signed amount", async () => {
    const { user, tr, inputsTo } = await openRow("Grocer");

    const outflow = within(tr).getByLabelText("Outflow");
    await user.clear(outflow);
    await user.type(outflow, "25+13{Enter}");

    await waitFor(() => expect(inputsTo("transaction.update")).toHaveLength(1));
    expect(inputsTo("transaction.update")[0]).toMatchObject({
      id: 1,
      amount: -38,
      date: "2026-10-01",
      payeeId: 200,
      categoryId: 100,
    });
  });

  test("a transfer between two on-budget accounts has no category to edit, and sends none", async () => {
    const { user, tr, inputsTo } = await openRow("Transfer : Savings");

    expect(within(tr).getByText("No category")).toBeTruthy();
    expect(within(tr).queryByRole("combobox")).toBeNull();

    await user.type(within(tr).getByLabelText("Memo"), "{Enter}");
    await waitFor(() => expect(inputsTo("transaction.update")).toHaveLength(1));
    const input = inputsTo("transaction.update")[0] as Record<string, unknown>;
    expect(input).toMatchObject({ id: 2, amount: -50 });
    // Neither a category nor a payee: the API owns both for a transfer.
    expect("categoryId" in input).toBe(false);
    expect("payeeId" in input).toBe(false);
  });

  test("a transfer out to an off-budget account keeps its category picker", async () => {
    const { tr } = await openRow("Transfer : Mortgage");

    expect(within(tr).queryByText("No category")).toBeNull();
    expect(within(tr).getByRole("combobox")).toBeTruthy();
  });
});

describe("reconciling", () => {
  // Nothing has cleared since the statement, so the cleared balance today is
  // the one the statement should show.
  const reconcileFixtures = {
    ...fixtures,
    "account.transactions": { ...fixtures["account.transactions"], clearedBalance: 250 },
    "account.reconcile": { reconciledCount: 0, adjustmentAmount: null },
  };

  async function openPanel() {
    const rendered = await renderRoute("/budgets/1/accounts/10", { fixtures: reconcileFixtures });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Reconcile" }));
    return { ...rendered, user, statement: screen.getByLabelText("Statement balance") };
  }

  test("a statement that agrees finishes without an adjustment", async () => {
    const { user, statement, inputsTo } = await openPanel();

    await user.type(statement, "200+50");
    await user.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => expect(inputsTo("account.reconcile")).toHaveLength(1));
    expect(inputsTo("account.reconcile")[0]).toEqual({
      budgetId: 1,
      accountId: 10,
      statementDate: formatDateISO(new Date()),
      statementBalance: 250,
      adjustment: false,
    });
  });

  test("a statement that disagrees asks first, then sends the adjustment", async () => {
    const { user, statement, inputsTo } = await openPanel();

    await user.type(statement, "300");
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(inputsTo("account.reconcile")).toHaveLength(0);

    await user.click(await screen.findByRole("button", { name: "Enter adjustment" }));
    await waitFor(() => expect(inputsTo("account.reconcile")).toHaveLength(1));
    expect(inputsTo("account.reconcile")[0]).toMatchObject({
      statementBalance: 300,
      adjustment: true,
    });
  });
});

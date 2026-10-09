import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "./router";

function payee(over: Record<string, unknown>) {
  return {
    targetAccountId: null,
    enabled: true,
    autofillCategoryId: null,
    autofillAmount: null,
    autofillMemo: null,
    transactionCount: 0,
    lastUsed: null,
    renameRules: [],
    ...over,
  };
}

const fixtures = {
  "budget.byId": { id: 1, name: "Household" },
  "account.list": [],
  "category.list": [
    { id: 1, name: "Everyday", isSystem: false, categories: [{ id: 100, name: "Food" }] },
  ],
  "payee.listForManage": [
    payee({ id: 1, name: "Grocer", transactionCount: 4 }),
    payee({ id: 2, name: "GROCER INC", transactionCount: 1 }),
    payee({ id: 3, name: "Unused" }),
    payee({ id: 4, name: "Transfer : Savings", targetAccountId: 11 }),
  ],
  "payee.merge": { movedTransactions: 1, movedRenameRules: 0 },
};

async function openPage() {
  const rendered = await renderRoute("/budgets/1/payees", { fixtures });
  await screen.findByText("4 payees");
  return { ...rendered, user: userEvent.setup() };
}

describe("payees page", () => {
  test("search narrows the list and says how many match", async () => {
    const { user } = await openPage();

    await user.type(screen.getByLabelText("Search payees"), "grocer");

    expect(screen.getByText("2 of 4 payees")).toBeTruthy();
    expect(screen.queryByText("Unused")).toBeNull();
  });

  test("renaming sends the trimmed name, and an unchanged one sends nothing", async () => {
    const { user, inputsTo } = await openPage();

    await user.click(screen.getByRole("button", { name: "Unused" }));
    await user.type(screen.getByLabelText("Payee name"), "{Enter}");
    expect(inputsTo("payee.rename")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Unused" }));
    const input = screen.getByLabelText("Payee name");
    await user.clear(input);
    await user.type(input, "  Gym  {Enter}");

    await waitFor(() => expect(inputsTo("payee.rename")).toHaveLength(1));
    expect(inputsTo("payee.rename")[0]).toEqual({ budgetId: 1, id: 3, name: "Gym" });
  });

  test("a transfer payee cannot be selected or renamed", async () => {
    await openPage();

    expect((screen.getByLabelText("Select Transfer : Savings") as HTMLInputElement).disabled).toBe(
      true
    );
    expect(screen.queryByRole("button", { name: "Transfer : Savings" })).toBeNull();
  });

  test("merging names the payee kept and folds the others into it", async () => {
    const { user, inputsTo } = await openPage();

    await user.click(screen.getByLabelText("Select Grocer"));
    await user.click(screen.getByLabelText("Select GROCER INC"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    const merge = screen.getByRole("button", { name: "Merge" }) as HTMLButtonElement;
    expect(merge.disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText("Payee to merge into"), "1");
    expect(
      screen.getByText(
        'Merge 1 payee into "Grocer", moving 1 transaction. The other names are removed.'
      )
    ).toBeTruthy();

    await user.click(merge);
    await waitFor(() => expect(inputsTo("payee.merge")).toHaveLength(1));
    expect(inputsTo("payee.merge")[0]).toEqual({ budgetId: 1, sourceIds: [2], targetId: 1 });
    expect(await screen.findByText(/Merged into "Grocer", moving 1 transactions/)).toBeTruthy();
  });

  test("the inspector saves autofill defaults and adds a rename rule", async () => {
    const { user, inputsTo } = await openPage();

    await user.click(screen.getByText("Unused").closest("tr")!);
    const panel = screen.getByRole("complementary");
    await user.selectOptions(within(panel).getByLabelText("Autofill category"), "100");
    await user.type(within(panel).getByLabelText("Autofill amount"), "-20-5");
    await user.type(within(panel).getByLabelText("Autofill memo"), " weekly ");
    await user.click(within(panel).getByRole("button", { name: "Save autofill" }));

    await waitFor(() => expect(inputsTo("payee.setAutofill")).toHaveLength(1));
    expect(inputsTo("payee.setAutofill")[0]).toEqual({
      budgetId: 1,
      id: 3,
      categoryId: 100,
      amount: -25,
      memo: "weekly",
    });

    await user.type(within(panel).getByLabelText("Rule text"), " ACME ");
    await user.click(within(panel).getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(inputsTo("payee.addRenameRule")).toHaveLength(1));
    expect(inputsTo("payee.addRenameRule")[0]).toEqual({
      budgetId: 1,
      payeeId: 3,
      operator: "Contains",
      operand: "ACME",
    });
  });
});

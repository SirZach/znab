import { describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "./router";

function schedule(over: Record<string, unknown>) {
  return {
    accountId: 10,
    account: { name: "Checking" },
    payeeId: 200,
    payee: { name: "Landlord" },
    categoryId: 100,
    category: { name: "Rent" },
    amount: "-1250.0000",
    date: "2026-11-01",
    frequency: "Monthly",
    twiceMonthDay: null,
    memo: null,
    isDue: false,
    dueCount: 0,
    isTransfer: false,
    ...over,
  };
}

const fixtures = {
  "budget.byId": { id: 1, name: "Household" },
  "account.list": [
    { id: 10, name: "Checking", hidden: false },
    { id: 12, name: "Old card", hidden: true },
  ],
  "payee.list": [{ id: 200, name: "Landlord", targetAccountId: null }],
  "category.list": [
    { id: 1, name: "Bills", isSystem: false, categories: [{ id: 100, name: "Rent" }] },
  ],
  "scheduledTransaction.list": [
    schedule({ id: 1 }),
    schedule({ id: 2, payee: { name: "Gym" }, payeeId: 201, isDue: true, dueCount: 3, frequency: "Once" }),
  ],
  "scheduledTransaction.enterDue": { entered: 3, schedules: 1, cappedOut: false, skipped: [] },
};

async function openPage() {
  const rendered = await renderRoute("/budgets/1/scheduled", { fixtures });
  await screen.findByText("2 scheduled, 1 due");
  return { ...rendered, user: userEvent.setup() };
}

const rowOf = (text: string) => screen.getByText(text).closest("tr")!;

describe("scheduled page", () => {
  test("lists schedules, offering only open accounts and no skip for a one off", async () => {
    await openPage();

    expect(screen.getByText("3 occurrences due")).toBeTruthy();
    expect(within(rowOf("Gym")).queryByRole("button", { name: "Skip" })).toBeNull();
    expect(within(rowOf("Landlord")).getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Old card" })).toBeNull();
  });

  test("Enter all due sweeps the budget and reports back", async () => {
    const { user, inputsTo } = await openPage();

    await user.click(screen.getByRole("button", { name: "Enter all due" }));

    await waitFor(() => expect(inputsTo("scheduledTransaction.enterDue")).toHaveLength(1));
    expect(inputsTo("scheduledTransaction.enterDue")[0]).toEqual({ budgetId: 1 });
    expect(await screen.findByText(/Entered 3 transactions across 1 schedule\./)).toBeTruthy();
  });

  test("adding sends the new schedule with the budget", async () => {
    const { user, inputsTo } = await openPage();

    await user.selectOptions(screen.getByLabelText("Account"), "10");
    await user.type(screen.getByLabelText("Amount"), "40");
    await user.click(screen.getByRole("button", { name: "Add schedule" }));

    await waitFor(() => expect(inputsTo("scheduledTransaction.create")).toHaveLength(1));
    expect(inputsTo("scheduledTransaction.create")[0]).toMatchObject({
      budgetId: 1,
      accountId: 10,
      amount: -40,
      frequency: "Monthly",
    });
  });

  test("editing opens a panel that saves against that schedule", async () => {
    const { user, inputsTo } = await openPage();

    await user.click(within(rowOf("Landlord")).getByRole("button", { name: "Edit" }));
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText(/Monthly, next/)).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(inputsTo("scheduledTransaction.update")).toHaveLength(1));
    expect(inputsTo("scheduledTransaction.update")[0]).toMatchObject({
      id: 1,
      accountId: 10,
      amount: -1250,
      date: "2026-11-01",
    });

    await user.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  test("deleting asks first, then removes", async () => {
    const { user, inputsTo } = await openPage();

    await user.click(within(rowOf("Gym")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete this scheduled transaction?")).toBeTruthy();
    expect(inputsTo("scheduledTransaction.remove")).toHaveLength(0);

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(inputsTo("scheduledTransaction.remove")).toHaveLength(1));
    expect(inputsTo("scheduledTransaction.remove")[0]).toEqual({ id: 2 });
  });
});

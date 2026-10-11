import { describe, expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManagedAccount } from "@/hooks/useAccounts";
import { renderWithTrpc } from "../../../test/trpc";
import { AccountInspector } from "./account-inspector";

const checking = {
  id: 10,
  name: "Checking",
  accountType: "Checking",
  onBudget: true,
  hidden: false,
  note: null,
} as unknown as ManagedAccount;

function renderInspector(used: number) {
  const props = {
    onUpdate: mock(),
    onSetHidden: mock(),
    onDelete: mock(),
    onClose: mock(),
  };
  const view = renderWithTrpc(
    <AccountInspector
      budgetId={1}
      account={checking}
      isSaving={false}
      updateError={null}
      hiddenError={null}
      deleteError={null}
      {...props}
    />,
    { fixtures: { "account.transactions": { total: used, transactions: [] } } }
  );
  return { ...view, ...props };
}

const optionValues = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => (o as HTMLOptionElement).value);

describe("AccountInspector", () => {
  test("a used account keeps its side of credit and its budgeting, and cannot be deleted", async () => {
    renderInspector(4);

    await screen.findByText(/Used by 4 transactions/);
    expect(optionValues(screen.getByLabelText("Account type"))).not.toContain("CreditCard");
    expect((screen.getByLabelText("Budgeting") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
  });

  test("an empty account offers every type and a confirmed delete", async () => {
    const { onDelete } = renderInspector(0);
    const user = userEvent.setup();

    const remove = await screen.findByRole("button", { name: "Delete account" });
    expect(optionValues(screen.getByLabelText("Account type"))).toContain("CreditCard");
    await user.click(remove);
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(10);
  });

  test("saves only what changed", async () => {
    const { onUpdate } = renderInspector(4);
    const user = userEvent.setup();
    const save = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;

    expect(save.disabled).toBe(true);
    await user.type(screen.getByLabelText("Note"), "joint");
    await user.click(save);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith(10, {
      accountType: undefined,
      onBudget: undefined,
      note: "joint",
    });
  });
});

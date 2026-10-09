import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatDateISO } from "@/lib/utils";
import { renderWithTrpc } from "../../../test/trpc";
import { NewAccountForm } from "./new-account-form";

function renderForm() {
  const onCreate = mock();
  renderWithTrpc(<NewAccountForm onCreate={onCreate} isCreating={false} error={null} />);
  const add = () => screen.getByRole("button", { name: "Add account" }) as HTMLButtonElement;
  const name = screen.getByPlaceholderText("Checking");
  const balance = screen.getByPlaceholderText("0.00");
  return { onCreate, add, name, balance };
}

describe("NewAccountForm", () => {
  test("waits for a name", () => {
    const { add } = renderForm();
    expect(add().disabled).toBe(true);
  });

  test("files a starting balance, dated today, from arithmetic", async () => {
    const { onCreate, add, name, balance } = renderForm();
    const user = userEvent.setup();

    await user.type(name, " Savings ");
    await user.type(balance, "25+13");
    await user.click(add());

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).toEqual({
      name: "Savings",
      accountType: "Checking",
      onBudget: true,
      note: undefined,
      startingBalance: 38,
      startingBalanceDate: formatDateISO(new Date()),
    });
  });

  test("sends no starting balance for zero", async () => {
    const { onCreate, name, balance } = renderForm();
    const user = userEvent.setup();

    await user.type(name, "Wallet");
    await user.type(balance, "0{Enter}");
    await user.type(name, "{Enter}");

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty("startingBalance");
  });

  test("refuses a balance it cannot read", async () => {
    const { add, name, balance } = renderForm();
    const user = userEvent.setup();

    await user.type(name, "Cash");
    await user.type(balance, "lots");

    expect(add().disabled).toBe(true);
    expect(screen.getByText("Enter a balance like 1200.50, or leave it blank.")).toBeTruthy();
  });
});

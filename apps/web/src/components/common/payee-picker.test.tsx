import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PayeePicker } from "./payee-picker";

const payees = [
  { id: 1, name: "Amberly Books" },
  { id: 2, name: "Warehouse Club" },
  { id: 3, name: "A Savvy Choice" },
  { id: 4, name: "Transfer : Savings" },
  // Imported names can carry stray spaces, which cmdk trims from its values.
  { id: 5, name: " Maple Lane Fuel" },
];

async function typeInPicker(text: string, list = payees) {
  const onPick = mock();
  const onCreate = mock();
  render(
    <PayeePicker payees={list} payeeId={null} payeeName="" onPick={onPick} onCreate={onCreate} />
  );
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.type(await screen.findByPlaceholderText("Search payees..."), text);
  return { onPick, onCreate };
}

describe("PayeePicker", () => {
  test("Enter on a partial name picks the closest payee", async () => {
    const { onPick, onCreate } = await typeInPicker("ambe{Enter}");
    expect(onPick).toHaveBeenCalledWith(payees[0]);
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("Tab on a partial name picks the closest payee", async () => {
    const { onPick, onCreate } = await typeInPicker("ware{Tab}");
    expect(onPick).toHaveBeenCalledWith(payees[1]);
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("a transfer matches on its account name, as if the Transfer prefix were not there", async () => {
    const { onPick } = await typeInPicker("sav{Enter}");
    expect(onPick).toHaveBeenCalledWith(payees[3]);
  });

  test("a transfer wins a tie with a plain payee of the same name", async () => {
    const tied = [
      { id: 6, name: "Rewards Card" },
      { id: 7, name: "Transfer : Rewards Card" },
    ];
    const { onPick } = await typeInPicker("Rewards Card{Enter}", tied);
    expect(onPick).toHaveBeenCalledWith(tied[1]);
  });

  test("a payee whose name has surrounding spaces is still the closest match", async () => {
    const { onPick } = await typeInPicker("maple{Tab}");
    expect(onPick).toHaveBeenCalledWith(payees[4]);
  });

  test("an unknown name is only created by picking the create choice", async () => {
    const { onPick, onCreate } = await typeInPicker("Corner Shop{Tab}");
    expect(onCreate).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("option", { name: 'Create payee "Corner Shop"' }));
    expect(onCreate).toHaveBeenCalledWith("Corner Shop");
  });

  test("a matching name offers no create choice", async () => {
    await typeInPicker("warehouse club");
    expect(screen.queryByRole("option", { name: /Create payee/ })).toBeNull();
  });

  test("Escape throws the search away", async () => {
    const { onPick, onCreate } = await typeInPicker("ambe{Escape}");
    expect(onPick).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

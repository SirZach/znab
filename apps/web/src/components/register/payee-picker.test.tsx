import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PayeePicker } from "./payee-picker";

const payees = [
  { id: 1, name: "Amazon" },
  { id: 2, name: "Costco" },
];

async function typeInPicker(text: string) {
  const onPick = mock();
  const onCreate = mock();
  render(
    <PayeePicker payees={payees} payeeId={null} payeeName="" onPick={onPick} onCreate={onCreate} />
  );
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.type(await screen.findByPlaceholderText("Search payees..."), text);
  return { onPick, onCreate };
}

describe("PayeePicker", () => {
  test("Enter on a partial name picks the closest payee", async () => {
    const { onPick, onCreate } = await typeInPicker("amaz{Enter}");
    expect(onPick).toHaveBeenCalledWith(payees[0]);
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("Tab on a partial name picks the closest payee", async () => {
    const { onPick, onCreate } = await typeInPicker("cost{Tab}");
    expect(onPick).toHaveBeenCalledWith(payees[1]);
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("an unknown name is only created by picking the create choice", async () => {
    const { onPick, onCreate } = await typeInPicker("Corner Shop{Tab}");
    expect(onCreate).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("option", { name: 'Create payee "Corner Shop"' }));
    expect(onCreate).toHaveBeenCalledWith("Corner Shop");
  });

  test("a matching name offers no create choice", async () => {
    await typeInPicker("costco");
    expect(screen.queryByRole("option", { name: /Create payee/ })).toBeNull();
  });

  test("Escape throws the search away", async () => {
    const { onPick, onCreate } = await typeInPicker("amaz{Escape}");
    expect(onPick).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

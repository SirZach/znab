import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegisterTransaction } from "@/hooks/useRegisterPages";
import { renderWithTrpc } from "../../../test/trpc";
import { EditCells } from "./edit-cells";

const txn = {
  id: 1,
  date: "2026-10-01",
  amount: "-12.00",
  payeeId: 200,
  payee: { name: "Grocer" },
  categoryId: 100,
  category: { name: "Food" },
  memo: "milk",
  flagColor: null,
  cleared: "Uncleared",
  isSplit: false,
  isTransfer: false,
  transferAccountId: null,
  counterpartCleared: null,
  runningBalance: 0,
} as unknown as RegisterTransaction;

function renderCells(over: Partial<RegisterTransaction> = {}) {
  const onSave = mock();
  const onDelete = mock();
  const onCycleCleared = mock();
  renderWithTrpc(
    <table>
      <tbody>
        <tr>
          <EditCells
            txn={{ ...txn, ...over }}
            locks={{}}
            payeeList={[]}
            categoryOptions={[{ id: 100, label: "Everyday: Food" }]}
            autofillForPayee={() => ({})}
            isBusy={false}
            onSave={onSave}
            onDelete={onDelete}
            onCancel={() => {}}
            onCycleCleared={onCycleCleared}
          />
        </tr>
      </tbody>
    </table>
  );
  return { onSave, onDelete, onCycleCleared, user: userEvent.setup() };
}

describe("EditCells", () => {
  test("seeds the draft from the row and saves it", async () => {
    const { onSave, user } = renderCells();
    expect((screen.getByLabelText("Memo") as HTMLInputElement).value).toBe("milk");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ memo: "milk", outflow: "12.00" });
  });

  test("delete asks first, and names a transfer's other side", async () => {
    const { onDelete, user } = renderCells({ isTransfer: true });
    await user.click(screen.getByRole("button", { name: "Delete transaction" }));
    expect(onDelete).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/matching transaction in the other account/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test("the C cell cycles the cleared status", async () => {
    const { onCycleCleared, user } = renderCells();
    await user.click(screen.getByTitle("Uncleared"));
    expect(onCycleCleared).toHaveBeenCalledTimes(1);
  });
});

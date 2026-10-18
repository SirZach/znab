import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyFields } from "@/lib/register-edit";
import { renderWithTrpc } from "../../../test/trpc";
import { AddRow } from "./add-row";

function renderAddRow(props: { isSaving?: boolean; error?: string | null } = {}) {
  const onSave = mock();
  const onCancel = mock();
  renderWithTrpc(
    <AddRow
      fields={emptyFields()}
      onChange={() => {}}
      payeeList={[]}
      categoryOptions={[]}
      autofillForPayee={() => ({})}
      locks={{}}
      onSave={onSave}
      onCancel={onCancel}
      isSaving={props.isSaving ?? false}
      error={props.error ?? null}
      dateInputRef={null}
    />
  );
  return { onSave, onCancel };
}

describe("AddRow", () => {
  test("Save saves", async () => {
    const { onSave } = renderAddRow();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test("Cancel discards the row without saving", async () => {
    const { onSave, onCancel } = renderAddRow();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("Save is held while a save is in flight, and an error shows under the row", () => {
    renderAddRow({ isSaving: true, error: "Pick a payee" });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText("Pick a payee")).toBeTruthy();
  });
});

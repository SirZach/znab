import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./confirm-dialog";

function renderDialog() {
  const onConfirm = mock();
  const onOpenChange = mock();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this account?"
      description="It cannot be brought back from here."
      confirmLabel="Delete"
      onConfirm={onConfirm}
    />
  );
  return { onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  test("says what it is asking", async () => {
    renderDialog();

    expect(await screen.findByText("Delete this account?")).toBeTruthy();
    expect(screen.getByText("It cannot be brought back from here.")).toBeTruthy();
  });

  test("confirming closes it and then acts", async () => {
    const { onConfirm, onOpenChange } = renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("cancelling closes it without acting", async () => {
    const { onConfirm, onOpenChange } = renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

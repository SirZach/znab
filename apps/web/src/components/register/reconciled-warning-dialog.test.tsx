import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTrpc } from "../../../test/trpc";
import { ReconciledWarningDialog } from "./reconciled-warning-dialog";

function renderDialog(ownSide: boolean) {
  const onConfirm = mock();
  const onOpenChange = mock();
  renderWithTrpc(
    <ReconciledWarningDialog
      open
      onOpenChange={onOpenChange}
      ownSide={ownSide}
      lastReconciledDate={null}
      onConfirm={onConfirm}
    />
  );
  return { onConfirm, onOpenChange };
}

describe("ReconciledWarningDialog", () => {
  test("words the warning for this row when it is the reconciled one", () => {
    renderDialog(true);
    expect(screen.getByText("This transaction is reconciled")).toBeTruthy();
  });

  test("words it for the far side of a transfer otherwise", () => {
    renderDialog(false);
    expect(screen.getByText("The other side of this transfer is reconciled")).toBeTruthy();
  });

  test("Edit anyway closes and confirms", async () => {
    const { onConfirm, onOpenChange } = renderDialog(true);
    await userEvent.click(screen.getByRole("button", { name: "Edit anyway" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTrpc } from "../../../test/trpc";
import { ReassignCategoryDialog } from "./reassign-category-dialog";

const NO_IMPACT = { changes: [], throughMonth: "2026-10", crossesMasterBudgets: false };
const OVERSPENT = {
  changes: [
    { month: "2026-02", delta: 50 },
    { month: "2026-03", delta: 50 },
  ],
  throughMonth: "2026-03",
  crossesMasterBudgets: true,
};

function renderDialog(preview: unknown) {
  const onConfirm = mock();
  const onCancel = mock();
  const rendered = renderWithTrpc(
    <ReassignCategoryDialog
      budgetId={1}
      categoryId={2}
      name="Groceries"
      options={[
        { id: 3, label: "Everyday: Fun" },
        { id: 4, label: "Bills: Rent" },
      ]}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
    { fixtures: { "category.reassignPreview": preview } }
  );
  return { onConfirm, onCancel, ...rendered };
}

async function pickRent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: "Bills: Rent" }));
}

const confirmButton = () =>
  screen.getByRole("button", { name: "Move and delete" }) as HTMLButtonElement;

describe("ReassignCategoryDialog", () => {
  test("with no impact, says so and deletes once a replacement is picked", async () => {
    const user = userEvent.setup();
    const { onConfirm, inputsTo } = renderDialog(NO_IMPACT);

    expect((await screen.findByRole("button", { name: "Move and delete" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    await pickRent(user);
    expect(await screen.findByText("To Be Budgeted is unchanged.")).toBeTruthy();
    expect(inputsTo("category.reassignPreview")).toEqual([{ budgetId: 1, categoryId: 2, reassignToId: 4 }]);
    await waitFor(() => expect(confirmButton().disabled).toBe(false));
    await user.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledWith(4, false);
  });

  test("with an impact, shows it and needs I understand before deleting", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(OVERSPENT);

    await pickRent(user);
    expect(await screen.findByText("+$50.00 from Feb 2026")).toBeTruthy();
    expect(screen.getByText(/household split will shift/)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);

    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(confirmButton().disabled).toBe(false));
    await user.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledWith(4, true);
  });

  test("cancelling does not delete", async () => {
    const { onConfirm, onCancel } = renderDialog(NO_IMPACT);

    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

import { describe, expect, mock, test } from "bun:test";
import { useState } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyFields } from "@/lib/register-edit";
import type { RegisterFields } from "@/lib/register-row";
import { renderWithTrpc } from "../../../test/trpc";
import { AddRow } from "./add-row";

const categoryOptions = [
  { id: 1, label: "Everyday: Groceries" },
  { id: 2, label: "Everyday: Restaurants" },
];

function renderAddRow(props: { isSaving?: boolean; error?: string | null } = {}) {
  const onSave = mock();
  const onCancel = mock();
  const onChange = mock();
  renderWithTrpc(
    <AddRow
      fields={emptyFields()}
      onChange={onChange}
      payeeList={[]}
      categoryOptions={categoryOptions}
      autofillForPayee={() => ({})}
      locks={{}}
      onSave={onSave}
      onCancel={onCancel}
      isSaving={props.isSaving ?? false}
      error={props.error ?? null}
      dateInputRef={null}
    />
  );
  return { onSave, onCancel, onChange };
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

  test("Tab on a partial category name picks the closest category", async () => {
    const { onChange } = renderAddRow();
    // The picker opens as it takes focus, the way tabbing into it does.
    act(() => screen.getByText("Category").closest("button")?.focus());
    await userEvent.type(await screen.findByPlaceholderText("Search categories..."), "rest{Tab}");
    expect(onChange).toHaveBeenCalledWith({ categoryId: 2 });
  });

  test("a payee's remembered category waits in the open picker to be confirmed", async () => {
    let latest: RegisterFields = emptyFields();
    function Stateful() {
      const [fields, setFields] = useState(emptyFields);
      latest = fields;
      return (
        <AddRow
          fields={fields}
          onChange={(patch) => setFields((prev) => ({ ...prev, ...patch }))}
          payeeList={[
            { id: 7, name: "Costco", autofillCategoryId: 2, autofillMemo: null, targetAccountId: null },
          ]}
          categoryOptions={categoryOptions}
          autofillForPayee={() => ({ categoryId: 2 })}
          locks={{}}
          onSave={() => {}}
          onCancel={() => {}}
          isSaving={false}
          error={null}
          dateInputRef={null}
        />
      );
    }
    renderWithTrpc(<Stateful />);

    await userEvent.click(screen.getByText("Payee"));
    await userEvent.type(await screen.findByPlaceholderText("Search payees..."), "cost{Enter}");

    const search = await screen.findByPlaceholderText("Search categories...");
    await waitFor(() => expect(document.activeElement).toBe(search));
    expect(
      screen.getByRole("option", { name: "Everyday: Restaurants" }).getAttribute("data-selected")
    ).toBe("true");

    await userEvent.keyboard("{Enter}");
    expect(latest.categoryId).toBe(2);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Memo")));
  });
});

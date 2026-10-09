import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManagedGroup } from "@/hooks/useCategories";
import { renderWithTrpc } from "../../../test/trpc";
import { CategoryGroupRows } from "./category-group-rows";

const group = (id: number, name: string, isSystem: boolean, categories: unknown[]) =>
  ({ id, name, isSystem, categories }) as unknown as ManagedGroup;

const bills = group(1, "Bills", false, [
  { id: 11, name: "Rent", used: 3 },
  { id: 12, name: "Power", used: 0 },
]);
const income = group(2, "Income", true, [{ id: 21, name: "Salary", used: 9 }]);
const empty = group(3, "Someday", false, []);
const movable = [bills, empty];

function renderRows(subject: ManagedGroup) {
  const handlers = {
    onEdit: mock(),
    onReorderGroups: mock(),
    onRenameGroup: mock(),
    onReorder: mock(),
    onRename: mock(),
    onMove: mock(),
    onCreate: mock(),
    onDelete: mock(),
  };
  renderWithTrpc(
    <table>
      <tbody>
        <CategoryGroupRows
          group={subject}
          movable={movable}
          editing={null}
          isReordering={false}
          isCreating={false}
          {...handlers}
        />
      </tbody>
    </table>
  );
  return handlers;
}

describe("CategoryGroupRows", () => {
  test("moving a category down sends the group's order with the pair swapped", async () => {
    const { onReorder } = renderRows(bills);
    await userEvent.click(screen.getByRole("button", { name: "Move Rent down" }));
    expect(onReorder).toHaveBeenCalledWith(1, [12, 11]);
  });

  test("moving a group sends the order of the movable groups", async () => {
    const { onReorderGroups } = renderRows(empty);
    await userEvent.click(screen.getByRole("button", { name: "Move Someday up" }));
    expect(onReorderGroups).toHaveBeenCalledWith([3, 1]);
  });

  test("offers delete only where it would be allowed", async () => {
    const { onDelete } = renderRows(bills);

    expect(screen.queryByRole("button", { name: "Delete Rent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Bills" })).toBeNull();
    expect(screen.getByText("in use")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Delete Power" }));
    expect(onDelete).toHaveBeenCalledWith({ kind: "category", id: 12, name: "Power" });
  });

  test("a system group is listed and locked", () => {
    renderRows(income);

    expect(screen.getByText("Salary")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  test("moving a category to another group picks from the movable ones", async () => {
    const { onMove } = renderRows(bills);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Move Rent to another group" }),
      "3"
    );
    expect(onMove).toHaveBeenCalledWith(11, 3);
  });
});

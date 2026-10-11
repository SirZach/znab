import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTrpc } from "../../../test/trpc";
import { BudgetedCell } from "./budgeted-cell";

function renderCell(value = 100) {
  const onSave = mock();
  const onMove = mock();
  const props = { categoryId: 1, onSave, onMove, registerRef: () => {} };
  const view = renderWithTrpc(<BudgetedCell {...props} value={value} />);
  const input = () => screen.getByRole("textbox", { name: "Budgeted amount" }) as HTMLInputElement;
  const rerender = (next: number) => view.rerender(<BudgetedCell {...props} value={next} />);
  return { input, onSave, onMove, rerender };
}

describe("BudgetedCell", () => {
  test("shows the value to two places", () => {
    const { input } = renderCell(100);
    expect(input().value).toBe("100.00");
  });

  test("follows a new value while not editing", () => {
    const { input, rerender } = renderCell(100);
    rerender(250);
    expect(input().value).toBe("250.00");
  });

  test("keeps the draft over a new value mid-edit", async () => {
    const { input, rerender } = renderCell(100);
    await userEvent.click(input());
    await userEvent.keyboard("42");
    rerender(250);
    expect(input().value).toBe("42");
  });

  test("Enter saves the evaluated expression and moves down", async () => {
    const { input, onSave, onMove } = renderCell(100);
    await userEvent.click(input());
    await userEvent.keyboard("25+13{Enter}");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(38);
    expect(onMove).toHaveBeenCalledWith(1);
  });

  test("ArrowUp commits and moves up", async () => {
    const { input, onSave, onMove } = renderCell(100);
    await userEvent.click(input());
    await userEvent.keyboard("5{ArrowUp}");
    expect(onSave).toHaveBeenCalledWith(5);
    expect(onMove).toHaveBeenCalledWith(-1);
  });

  test("leaving without typing saves nothing", async () => {
    const { input, onSave } = renderCell(100);
    await userEvent.click(input());
    await userEvent.tab();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("an unchanged amount is not saved", async () => {
    const { input, onSave } = renderCell(100);
    await userEvent.click(input());
    await userEvent.keyboard("100{Enter}");
    expect(onSave).not.toHaveBeenCalled();
  });

  test("an unreadable amount is dropped and the value shown again", async () => {
    const { input, onSave } = renderCell(100);
    await userEvent.click(input());
    await userEvent.keyboard("abc");
    await userEvent.tab();
    expect(onSave).not.toHaveBeenCalled();
    expect(input().value).toBe("100.00");
  });

  test("Escape throws the draft away", async () => {
    const { input, onSave } = renderCell(100);
    await userEvent.click(input());
    await userEvent.keyboard("7{Escape}");
    expect(onSave).not.toHaveBeenCalled();
    expect(input().value).toBe("100.00");
  });
});

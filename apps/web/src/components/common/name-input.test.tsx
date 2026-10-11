import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NameInput } from "./name-input";

function renderInput(initial = "Groceries") {
  const onCommit = mock();
  const onCancel = mock();
  render(
    <NameInput initial={initial} aria-label="Category name" onCommit={onCommit} onCancel={onCancel} />
  );
  return { input: screen.getByRole("textbox", { name: "Category name" }), onCommit, onCancel };
}

describe("NameInput", () => {
  test("opens focused on the current name", () => {
    const { input } = renderInput();

    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Groceries");
  });

  test("Enter commits the trimmed name", async () => {
    const { input, onCommit, onCancel } = renderInput();

    await userEvent.clear(input);
    await userEvent.type(input, "  Food  {Enter}");

    expect(onCommit).toHaveBeenCalledWith("Food");
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("leaving the field commits too", async () => {
    const { input, onCommit } = renderInput();

    await userEvent.type(input, "!");
    await userEvent.tab();

    expect(onCommit).toHaveBeenCalledWith("Groceries!");
  });

  test("Escape cancels and commits nothing", async () => {
    const { input, onCommit, onCancel } = renderInput();

    await userEvent.type(input, "Food{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

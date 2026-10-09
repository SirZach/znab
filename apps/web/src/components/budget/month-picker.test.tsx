import { describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { currentMonthParam } from "@/lib/utils";
import { renderWithTrpc } from "../../../test/trpc";
import { MonthPicker } from "./month-picker";

function renderPicker() {
  const onSelect = mock();
  renderWithTrpc(
    <MonthPicker months={["2025-11-01", "2025-12-01", "2026-01-01"]} onSelect={onSelect} />
  );
  return { onSelect };
}

describe("MonthPicker", () => {
  test("lists years newest first, each with its months", () => {
    renderPicker();
    const years = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(years).toEqual(["2026", "2025"]);

    const year2025 = screen.getByRole("heading", { name: "2025" }).parentElement!;
    const months = within(year2025).getAllByRole("button").map((b) => b.textContent);
    expect(months).toEqual(["Nov", "Dec"]);
  });

  test("a month selects its month param", async () => {
    const { onSelect } = renderPicker();
    await userEvent.click(screen.getByRole("button", { name: "Dec" }));
    expect(onSelect).toHaveBeenCalledWith("12/2025");
  });

  test("the shortcut selects the current month", async () => {
    const { onSelect } = renderPicker();
    await userEvent.click(screen.getByRole("button", { name: "go to current month" }));
    expect(onSelect).toHaveBeenCalledWith(currentMonthParam());
  });
});

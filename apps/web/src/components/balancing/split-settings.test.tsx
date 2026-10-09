import { describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HouseholdSplitOutputs } from "@/trpc";
import { renderWithTrpc } from "../../../test/trpc";
import { SplitSettings } from "./split-settings";

const settings = {
  primaryBudgetId: 1,
  partnerBudgetId: 2,
  savingsPercent: 20,
  budgets: [
    { id: 1, name: "Zach", groups: [{ id: 5, name: "Bills", inMasterBudgets: true }] },
    { id: 2, name: "Fiona", groups: [] },
  ],
} as unknown as HouseholdSplitOutputs["settings"];

describe("SplitSettings", () => {
  test("saves the two budgets and the percent", async () => {
    const { inputsTo } = renderWithTrpc(<SplitSettings settings={settings} prompt={false} />);
    const user = userEvent.setup();

    const percent = screen.getByLabelText("Savings percent");
    await user.clear(percent);
    await user.type(percent, "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(inputsTo("householdSplit.updateSettings")).toHaveLength(1));
    expect(inputsTo("householdSplit.updateSettings")[0]).toEqual({
      primaryBudgetId: 1,
      partnerBudgetId: 2,
      savingsPercent: 25,
    });
  });

  test("will not save a percent over 100", async () => {
    renderWithTrpc(<SplitSettings settings={settings} prompt={false} />);
    const user = userEvent.setup();

    const percent = screen.getByLabelText("Savings percent");
    await user.clear(percent);
    await user.type(percent, "150");

    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("ticking a group sends the flag for that budget", async () => {
    const { inputsTo } = renderWithTrpc(<SplitSettings settings={settings} prompt />);

    expect(screen.getByText(/Choose the two budgets/)).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: "Bills" }));

    await waitFor(() => expect(inputsTo("householdSplit.setGroupFlag")).toHaveLength(1));
    expect(inputsTo("householdSplit.setGroupFlag")[0]).toEqual({
      budgetId: 1,
      groupId: 5,
      inMasterBudgets: false,
    });
  });
});

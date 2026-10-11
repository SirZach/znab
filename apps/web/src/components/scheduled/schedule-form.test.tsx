import { describe, expect, mock, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatDateISO } from "@/lib/utils";
import { ScheduleForm } from "./schedule-form";

const accounts = [
  { id: 10, name: "Checking" },
  { id: 11, name: "Savings" },
];
const payees = [{ id: 200, name: "Landlord" }];
const categoryOptions = [{ id: 100, label: "Bills: Rent" }];

function renderForm(props: Partial<Parameters<typeof ScheduleForm>[0]> = {}) {
  const onSubmit = mock();
  render(
    <ScheduleForm
      accounts={accounts}
      payees={payees}
      categoryOptions={categoryOptions}
      submitLabel="Add schedule"
      isPending={false}
      error={null}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit, user: userEvent.setup() };
}

describe("ScheduleForm", () => {
  test("cannot be sent until it has an account and an amount", async () => {
    const { user } = renderForm();
    const add = screen.getByRole("button", { name: "Add schedule" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText("Account"), "10");
    expect(add.disabled).toBe(true);

    await user.type(screen.getByLabelText("Amount"), "25+");
    expect(add.disabled).toBe(true);
    expect(screen.getByText(/Enter an amount like 45.50/)).toBeTruthy();
  });

  test("sends a signed amount and a trimmed memo, then clears only the per schedule fields", async () => {
    const { user, onSubmit } = renderForm();

    await user.selectOptions(screen.getByLabelText("Account"), "10");
    await user.type(screen.getByLabelText("Amount"), "25+13");
    await user.type(screen.getByLabelText("Memo (optional)"), "  gym {Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [values, done] = onSubmit.mock.calls[0]!;
    expect(values).toEqual({
      accountId: 10,
      payeeId: null,
      categoryId: null,
      amount: -38,
      date: formatDateISO(new Date()),
      frequency: "Monthly",
      twiceMonthDay: null,
      memo: "gym",
    });

    act(() => done());
    await waitFor(() =>
      expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("")
    );
    expect((screen.getByLabelText("Memo (optional)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Account") as HTMLSelectElement).value).toBe("10");
  });

  test("an inflow twice a month sends a positive amount and a start day", async () => {
    const { user, onSubmit } = renderForm();

    await user.selectOptions(screen.getByLabelText("Account"), "11");
    await user.selectOptions(screen.getByLabelText("Direction"), "inflow");
    await user.type(screen.getByLabelText("Amount"), "1500");
    await user.selectOptions(screen.getByLabelText("Frequency"), "TwiceAMonth");
    await user.selectOptions(screen.getByLabelText("Start day"), "1");
    await user.click(screen.getByRole("button", { name: "Add schedule" }));

    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      accountId: 11,
      amount: 1500,
      frequency: "TwiceAMonth",
      twiceMonthDay: 1,
    });
  });

  test("editing starts from the stored schedule and sends it back unchanged", async () => {
    const { user, onSubmit } = renderForm({
      stacked: true,
      submitLabel: "Save changes",
      initial: {
        accountId: 10,
        payeeId: 200,
        payee: { name: "Landlord" },
        categoryId: 100,
        amount: "-1250.0000",
        date: "2026-11-01",
        frequency: "Monthly",
        twiceMonthDay: null,
        memo: "rent",
      },
    });

    expect(screen.getByText("Landlord")).toBeTruthy();
    expect(screen.getByText("Bills: Rent")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSubmit.mock.calls[0]![0]).toEqual({
      accountId: 10,
      payeeId: 200,
      categoryId: 100,
      amount: -1250,
      date: "2026-11-01",
      frequency: "Monthly",
      twiceMonthDay: null,
      memo: "rent",
    });
  });
});

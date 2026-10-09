import { describe, expect, test } from "bun:test";
import { draftFrom, draftStartDay, draftToSchedule, scheduleLabel } from "./schedule-draft";

const row = {
  accountId: 10,
  payeeId: 200,
  payee: { name: "Landlord" },
  categoryId: 100,
  amount: "-1250.0000",
  date: "2026-10-05",
  frequency: "Monthly",
  twiceMonthDay: null,
  memo: null,
};

describe("draftFrom", () => {
  test("a blank form is a monthly outflow with nothing picked", () => {
    expect(draftFrom(undefined)).toMatchObject({
      accountId: null,
      payeeId: null,
      payeeName: "",
      categoryId: null,
      outflow: true,
      amount: "",
      frequency: "Monthly",
      twiceMonthDay: null,
      memo: "",
    });
  });

  test("a stored outflow reads as an unsigned amount with the direction apart", () => {
    const draft = draftFrom(row);
    expect(draft).toMatchObject({
      accountId: 10,
      payeeId: 200,
      payeeName: "Landlord",
      categoryId: 100,
      outflow: true,
      amount: "1250",
      memo: "",
    });
    // A local day, not UTC midnight shifted back a day.
    expect(draft.date.getFullYear()).toBe(2026);
    expect(draft.date.getMonth()).toBe(9);
    expect(draft.date.getDate()).toBe(5);
  });

  test("a stored inflow is not an outflow", () => {
    expect(draftFrom({ ...row, amount: "300.5" })).toMatchObject({ outflow: false, amount: "300.5" });
  });
});

describe("draftToSchedule", () => {
  test("round trips a stored schedule", () => {
    expect(draftToSchedule(draftFrom(row))).toEqual({
      accountId: 10,
      payeeId: 200,
      categoryId: 100,
      amount: -1250,
      date: "2026-10-05",
      frequency: "Monthly",
      twiceMonthDay: null,
      memo: "",
    });
  });

  test("works the arithmetic and signs it by direction", () => {
    const draft = { ...draftFrom(row), amount: "25+13", outflow: false };
    expect(draftToSchedule(draft)?.amount).toBe(38);
    expect(draftToSchedule({ ...draft, outflow: true })?.amount).toBe(-38);
  });

  test("a typed name with no payee picked is sent as a name", () => {
    const draft = { ...draftFrom(row), payeeId: null, payeeName: "  New Gym  " };
    const schedule = draftToSchedule(draft);
    expect(schedule?.payeeId).toBeNull();
    expect(schedule?.payeeName).toBe("New Gym");
  });

  test("a picked payee sends no name", () => {
    expect("payeeName" in (draftToSchedule(draftFrom(row)) ?? {})).toBe(false);
  });

  test("twice a month sends a start day, falling back to the start date's day", () => {
    const draft = { ...draftFrom(row), frequency: "TwiceAMonth" as const };
    expect(draftToSchedule(draft)?.twiceMonthDay).toBe(5);
    expect(draftToSchedule({ ...draft, twiceMonthDay: 1 })?.twiceMonthDay).toBe(1);
    expect(draftStartDay(draft)).toBe(5);
  });

  test("any other frequency drops a start day it was carrying", () => {
    expect(draftToSchedule({ ...draftFrom(row), twiceMonthDay: 3 })?.twiceMonthDay).toBeNull();
  });

  test("trims the memo", () => {
    expect(draftToSchedule({ ...draftFrom(row), memo: "  rent " })?.memo).toBe("rent");
  });

  test("is nothing without an account or with an unreadable amount", () => {
    expect(draftToSchedule({ ...draftFrom(row), accountId: null })).toBeNull();
    expect(draftToSchedule({ ...draftFrom(row), amount: "25+" })).toBeNull();
    expect(draftToSchedule({ ...draftFrom(row), amount: "" })).toBeNull();
  });
});

describe("scheduleLabel", () => {
  test("names the payee and the amount", () => {
    expect(scheduleLabel(row)).toContain("Landlord for ");
    expect(scheduleLabel({ ...row, payee: null })).toContain("No payee for ");
  });
});

import { describe, expect, test } from "bun:test";
import {
  amountToFields,
  fieldsToAmount,
  transferCategoryEditable,
  unsaveableReason,
} from "./register-row";
import type { RegisterFields } from "./register-row";

/** Only the money half of a row matters here, so the rest is left out. */
const money = (outflow: string, inflow: string) => ({ outflow, inflow });

describe("amountToFields: the sign decides which column an amount belongs in", () => {
  test("a negative amount is an outflow, written without its sign", () => {
    expect(amountToFields("-105.44")).toEqual({ outflow: "105.44", inflow: "" });
    expect(amountToFields(-7)).toEqual({ outflow: "7.00", inflow: "" });
  });

  test("a positive amount is an inflow", () => {
    expect(amountToFields("3.20")).toEqual({ outflow: "", inflow: "3.20" });
    expect(amountToFields(12.5)).toEqual({ outflow: "", inflow: "12.50" });
  });

  test("a NUMERIC straight from the database is padded back to cents", () => {
    expect(amountToFields("-1200.0000")).toEqual({ outflow: "1200.00", inflow: "" });
  });
});

describe("amountToFields: an amount there is nothing to show for fills neither column", () => {
  test("zero leaves both columns empty rather than showing an outflow of nothing", () => {
    expect(amountToFields("0.00")).toEqual({ outflow: "", inflow: "" });
    expect(amountToFields(0)).toEqual({ outflow: "", inflow: "" });
  });

  test("an unreadable amount is left blank rather than guessed at", () => {
    expect(amountToFields("")).toEqual({ outflow: "", inflow: "" });
    expect(amountToFields("abc")).toEqual({ outflow: "", inflow: "" });
    expect(amountToFields(NaN)).toEqual({ outflow: "", inflow: "" });
  });
});

describe("fieldsToAmount: the column a number sits in gives it its sign", () => {
  test("an outflow saves as a negative amount", () => {
    expect(fieldsToAmount(money("105.44", ""))).toBe(-105.44);
  });

  test("an inflow saves as a positive one", () => {
    expect(fieldsToAmount(money("", "105.44"))).toBe(105.44);
  });

  test("surrounding whitespace is not an entry", () => {
    expect(fieldsToAmount(money("  42  ", " "))).toBe(-42);
  });
});

describe("fieldsToAmount: money fields take arithmetic, like every other one", () => {
  test("a sum is added up", () => {
    expect(fieldsToAmount(money("25+13", ""))).toBe(-38);
    expect(fieldsToAmount(money("", "25+13"))).toBe(38);
  });

  test("the same expressions the budget grid takes work here", () => {
    expect(fieldsToAmount(money("(40+5)*2", ""))).toBe(-90);
    expect(fieldsToAmount(money("$1,200.50", ""))).toBe(-1200.5);
  });

  test("an expression that does not finish is not an amount", () => {
    expect(fieldsToAmount(money("25+", ""))).toBeNull();
    expect(fieldsToAmount(money("12 34", ""))).toBeNull();
  });
});

describe("fieldsToAmount: an entry it cannot read comes back as nothing", () => {
  // Zero is an amount a row can hold, not a failure to read one. Whether it is
  // worth saving is the caller's question, and unsaveableReason answers it
  // differently for a new row than for one already on the books.
  test("an empty row is an amount of nothing", () => {
    expect(fieldsToAmount(money("", ""))).toBe(0);
  });

  test("both columns filled is ambiguous, so neither is taken", () => {
    expect(fieldsToAmount(money("10", "5"))).toBeNull();
    // Even when only one of the two could be read: something was meant by both.
    expect(fieldsToAmount(money("10", "abc"))).toBeNull();
  });

  test("unreadable text is not an amount", () => {
    expect(fieldsToAmount(money("abc", ""))).toBeNull();
  });

  test("an explicit zero reads as zero, in either column and without a sign", () => {
    expect(fieldsToAmount(money("0", ""))).toBe(0);
    expect(fieldsToAmount(money("", "0.00"))).toBe(0);
    // Not -0, which would carry a direction an amount of nothing does not have.
    expect(Object.is(fieldsToAmount(money("0", "")), 0)).toBe(true);
  });

  test("a negative in a column that already carries the sign is refused", () => {
    expect(fieldsToAmount(money("-5", ""))).toBeNull();
    expect(fieldsToAmount(money("", "-5"))).toBeNull();
    expect(fieldsToAmount(money("20-25", ""))).toBeNull();
  });
});

describe("transferCategoryEditable: only spending out of the budget is categorised", () => {
  const onBudget = { onBudget: true };
  const offBudget = { onBudget: false };

  test("paying a tracking account from a budgeted one is spending, so it has a category", () => {
    expect(transferCategoryEditable(onBudget, offBudget)).toBe(true);
  });

  test("moving money between two budgeted accounts spends nothing", () => {
    expect(transferCategoryEditable(onBudget, onBudget)).toBe(false);
  });

  test("the off-budget side of that same pair carries no category either", () => {
    expect(transferCategoryEditable(offBudget, onBudget)).toBe(false);
  });

  test("two tracking accounts are outside the budget entirely", () => {
    expect(transferCategoryEditable(offBudget, offBudget)).toBe(false);
  });

  test("an account that has not loaded yet is not a category to edit", () => {
    expect(transferCategoryEditable(undefined, offBudget)).toBe(false);
    expect(transferCategoryEditable(onBudget, undefined)).toBe(false);
    expect(transferCategoryEditable(undefined, undefined)).toBe(false);
  });
});

describe("unsaveableReason", () => {
  const row = (over: Partial<RegisterFields> = {}): RegisterFields => ({
    date: new Date("2026-02-01T00:00:00"),
    payeeId: null,
    payeeName: "",
    categoryId: null,
    memo: "",
    flagColor: null,
    checkNumber: "",
    outflow: "12.00",
    inflow: "",
    ...over,
  });

  test("a row with a date and one amount is saveable", () => {
    expect(unsaveableReason(row())).toBeNull();
    expect(unsaveableReason(row({ outflow: "", inflow: "9" }))).toBeNull();
  });

  test("arithmetic counts as an amount", () => {
    expect(unsaveableReason(row({ outflow: "25+13" }))).toBeNull();
  });

  test("a row with no date says so before anything else", () => {
    expect(unsaveableReason(row({ date: undefined, outflow: "" }))).toBe("Pick a date first.");
  });

  test("both columns filled is refused rather than guessed at", () => {
    expect(unsaveableReason(row({ outflow: "5", inflow: "5" }))).toBe(
      "Enter an outflow or an inflow, not both."
    );
  });

  test("an empty new row asks for an amount rather than saving nothing", () => {
    expect(unsaveableReason(row({ outflow: "", inflow: "" }))).toBe(
      "Enter an amount greater than zero."
    );
    expect(unsaveableReason(row({ outflow: "0" }))).toBe("Enter an amount greater than zero.");
    expect(unsaveableReason(row({ outflow: "0.00" }))).toBe("Enter an amount greater than zero.");
  });

  // The 14 zero-amount transactions in the real budgets open with both money
  // columns blank. Refusing that on an edit would lock their memo and payee
  // behind an amount their owner never meant to change.
  test("a row already on the books may be worth nothing", () => {
    expect(unsaveableReason(row({ outflow: "", inflow: "" }), { allowZero: true })).toBeNull();
    expect(unsaveableReason(row({ outflow: "0" }), { allowZero: true })).toBeNull();
  });

  test("something unreadable is refused however the row got here", () => {
    expect(unsaveableReason(row({ outflow: "abc" }))).toBe("That is not an amount.");
    expect(unsaveableReason(row({ outflow: "abc" }), { allowZero: true })).toBe(
      "That is not an amount."
    );
  });
});

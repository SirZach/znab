import { describe, expect, test } from "bun:test";
import { adjustAmount, formatDateShort, parseAmountExpression } from "./utils";

describe("parseAmountExpression", () => {
  test("reads plain amounts", () => {
    expect(parseAmountExpression("25")).toBe(25);
    expect(parseAmountExpression("25.50")).toBe(25.5);
    expect(parseAmountExpression("-10")).toBe(-10);
    expect(parseAmountExpression("0")).toBe(0);
  });

  test("tolerates how people actually type money", () => {
    expect(parseAmountExpression("$1,234.56")).toBe(1234.56);
    expect(parseAmountExpression(" 42 ")).toBe(42);
    expect(parseAmountExpression("=25+13")).toBe(38);
  });

  test("does arithmetic, with precedence", () => {
    expect(parseAmountExpression("25+13")).toBe(38);
    expect(parseAmountExpression("100-20")).toBe(80);
    expect(parseAmountExpression("50*2")).toBe(100);
    expect(parseAmountExpression("120/3")).toBe(40);
    expect(parseAmountExpression("10+2*5")).toBe(20);
    expect(parseAmountExpression("(40+5)*2")).toBe(90);
    expect(parseAmountExpression("100/3")).toBe(33.33);
  });

  test("handles signs", () => {
    expect(parseAmountExpression("-25+50")).toBe(25);
    expect(parseAmountExpression("50+-25")).toBe(25);
    expect(parseAmountExpression("-(10+5)")).toBe(-15);
  });

  test("rejects anything it cannot read rather than guessing", () => {
    expect(parseAmountExpression("")).toBeNull();
    expect(parseAmountExpression("abc")).toBeNull();
    expect(parseAmountExpression("25+")).toBeNull();
    expect(parseAmountExpression("12 34")).toBeNull();
    expect(parseAmountExpression("(25")).toBeNull();
    expect(parseAmountExpression("25)")).toBeNull();
    expect(parseAmountExpression("25/0")).toBeNull();
  });

  test("does not evaluate anything but arithmetic", () => {
    expect(parseAmountExpression("1;alert(1)")).toBeNull();
    expect(parseAmountExpression("process.exit(1)")).toBeNull();
  });
});

describe("adjustAmount", () => {
  test("adds the typed amount to the cell", () => {
    expect(adjustAmount(125.24, "+", "76.54")).toBe(201.78);
  });

  test("subtracts the typed amount from the cell", () => {
    expect(adjustAmount(250, "-", "50")).toBe(200);
  });

  test("works from a cell that is already negative", () => {
    expect(adjustAmount(-30, "+", "10")).toBe(-20);
  });

  test("works from a cell of zero", () => {
    expect(adjustAmount(0, "+", "5")).toBe(5);
    expect(adjustAmount(0, "-", "5")).toBe(-5);
  });

  test("reads the typed amount as a magnitude, not a signed number", () => {
    // The button already chose the operation, so a minus typed into the
    // minus popup does not flip it into an add.
    expect(adjustAmount(250, "-", "-50")).toBe(200);
    expect(adjustAmount(250, "+", "-50")).toBe(300);
  });

  test("refuses to save when the typed amount cannot be read", () => {
    expect(adjustAmount(100, "+", "")).toBeNull();
    expect(adjustAmount(100, "+", "+")).toBeNull();
    expect(adjustAmount(100, "+", "abc")).toBeNull();
  });

  test("rounds to cents, same as every other money field", () => {
    expect(adjustAmount(0.1, "+", "0.2")).toBe(0.3);
  });
});

describe("formatDateShort: a date in a column rather than a sentence", () => {
  test("reads the parts straight out of the stored date", () => {
    expect(formatDateShort("2024-11-11")).toBe("11/11/2024");
    expect(formatDateShort("2026-02-07")).toBe("02/07/2026");
  });

  test("keeps the leading zeros, so a column of them lines up", () => {
    expect(formatDateShort("2013-09-01")).toBe("09/01/2013");
  });

  test("never shifts the day, whatever the machine thinks the time is", () => {
    // The long form goes through Date and has to append T00:00:00 to stop the
    // day sliding backwards. This one never builds a Date at all, so there is
    // nothing to slide: the answer is the string it was given, rearranged.
    for (const date of ["2024-01-01", "2024-12-31", "2024-02-29", "2026-09-18"]) {
      const [y, m, d] = date.split("-");
      expect(formatDateShort(date)).toBe(`${m}/${d}/${y}`);
    }
  });
});

import { describe, expect, test } from "bun:test";
import { parseAmountExpression } from "./utils";

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

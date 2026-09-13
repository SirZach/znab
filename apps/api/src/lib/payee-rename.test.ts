import { describe, expect, test } from "bun:test";
import { matchesRenameRule, resolveRenamedPayee } from "./payee-rename";
import type { RenameRule } from "./payee-rename";
import type { PayeeRenameOperator } from "@znab/shared";

/** Small builder so each case reads as the rule it describes. */
const rule = (payeeId: number, operator: RenameRule["operator"], operand: string): RenameRule => ({
  payeeId,
  operator,
  operand,
});

describe("matchesRenameRule: each operator compares the way YNAB 4 does", () => {
  test("Is demands the whole string", () => {
    expect(matchesRenameRule("Lucky Noodle", "Is", "Lucky Noodle")).toBe(true);
    expect(matchesRenameRule("Lucky Noodle Express", "Is", "Lucky Noodle")).toBe(false);
  });

  test("Contains looks anywhere in the string", () => {
    expect(matchesRenameRule("POS DEBIT Lucky Noodle 0412", "Contains", "Lucky Noodle")).toBe(true);
    expect(matchesRenameRule("POS DEBIT Thai Taste 0412", "Contains", "Lucky Noodle")).toBe(false);
  });

  test("StartsWith anchors to the front", () => {
    expect(matchesRenameRule("Google Pay 8812", "StartsWith", "Google Pay")).toBe(true);
    expect(matchesRenameRule("SQ Google Pay", "StartsWith", "Google Pay")).toBe(false);
  });

  test("EndsWith anchors to the end", () => {
    expect(matchesRenameRule("SQ Main St Jewelry", "EndsWith", "Main St Jewelry")).toBe(true);
    expect(matchesRenameRule("Main St Jewelry Repair", "EndsWith", "Main St Jewelry")).toBe(false);
  });
});

describe("matchesRenameRule: comparison ignores case and surrounding whitespace", () => {
  test("case never decides a match", () => {
    expect(matchesRenameRule("lucky noodle", "Is", "LUCKY NOODLE")).toBe(true);
    expect(matchesRenameRule("POS HILLTOP CABS", "Contains", "Hilltop Cabs")).toBe(true);
  });

  test("padding on the imported name is ignored", () => {
    expect(matchesRenameRule("  Lucky Noodle \n", "Is", "Lucky Noodle")).toBe(true);
  });

  test("the real tab-prefixed operand still matches the payee it was saved for", () => {
    expect(matchesRenameRule(
      "Acme Heating & Air Cond",
      "Is",
      "\tAcme Heating & Air Cond",
    )).toBe(true);
  });
});

describe("matchesRenameRule: an empty operand matches nothing", () => {
  test("a blank operand does not swallow every import", () => {
    for (const operator of ["Is", "Contains", "StartsWith", "EndsWith"] as const) {
      expect(matchesRenameRule("Lucky Noodle", operator, "")).toBe(false);
      expect(matchesRenameRule("Lucky Noodle", operator, "   ")).toBe(false);
    }
  });

  test("an empty imported name matches nothing either", () => {
    expect(matchesRenameRule("", "Contains", "Lucky Noodle")).toBe(false);
  });
});

describe("matchesRenameRule: an operator outside the vocabulary claims nothing", () => {
  // The operator column is free text, so a hand-edited or future row can carry
  // anything. The cast is how such a row reaches the matcher at runtime.
  const unknown = "Regex" as PayeeRenameOperator;

  test("an unrecognised operator matches no name", () => {
    expect(matchesRenameRule("Lucky Noodle", unknown, "Lucky Noodle")).toBe(false);
    expect(matchesRenameRule("Lucky Noodle", unknown, "China")).toBe(false);
  });

  test("and never claims a payee during resolution", () => {
    expect(resolveRenamedPayee("Lucky Noodle", [rule(9, unknown, "Lucky Noodle")])).toBeNull();
  });
});

describe("resolveRenamedPayee: the tightest matching rule wins", () => {
  const exact = rule(1, "Is", "Lucky Noodle");
  const loose = rule(2, "Contains", "China");

  test("an exact rule beats another payee's Contains rule when listed second", () => {
    expect(resolveRenamedPayee("Lucky Noodle", [loose, exact])).toBe(1);
  });

  test("and beats it when listed first", () => {
    expect(resolveRenamedPayee("Lucky Noodle", [exact, loose])).toBe(1);
  });

  test("the loose rule still claims strings the exact rule does not", () => {
    expect(resolveRenamedPayee("China Garden", [loose, exact])).toBe(2);
  });

  test("an anchored rule beats a Contains rule", () => {
    const anchored = rule(3, "StartsWith", "China T");
    expect(resolveRenamedPayee("Lucky Noodle Express", [loose, anchored])).toBe(3);
  });

  test("rules of the same operator are settled by list order", () => {
    expect(resolveRenamedPayee("Lucky Noodle Express", [
      rule(4, "Contains", "Taste"),
      rule(5, "Contains", "China"),
    ])).toBe(4);
  });
});

describe("resolveRenamedPayee: an unclaimed name renames to nothing", () => {
  test("no rules at all returns null", () => {
    expect(resolveRenamedPayee("Lucky Noodle", [])).toBeNull();
  });

  test("rules that all miss return null", () => {
    expect(resolveRenamedPayee("Hilltop Cabs", [
      rule(1, "Is", "Lucky Noodle"),
      rule(2, "Contains", "Google Pay"),
    ])).toBeNull();
  });
});

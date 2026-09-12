import { describe, expect, test } from "bun:test";
import { matchesRenameRule, resolveRenamedPayee } from "./payee-rename";
import type { RenameRule } from "./payee-rename";

/** Small builder so each case reads as the rule it describes. */
const rule = (payeeId: number, operator: RenameRule["operator"], operand: string): RenameRule => ({
  payeeId,
  operator,
  operand,
});

describe("matchesRenameRule: each operator compares the way YNAB 4 does", () => {
  test("Is demands the whole string", () => {
    expect(matchesRenameRule("China Taste", "Is", "China Taste")).toBe(true);
    expect(matchesRenameRule("China Taste Express", "Is", "China Taste")).toBe(false);
  });

  test("Contains looks anywhere in the string", () => {
    expect(matchesRenameRule("POS DEBIT China Taste 0412", "Contains", "China Taste")).toBe(true);
    expect(matchesRenameRule("POS DEBIT Thai Taste 0412", "Contains", "China Taste")).toBe(false);
  });

  test("StartsWith anchors to the front", () => {
    expect(matchesRenameRule("Google Pay 8812", "StartsWith", "Google Pay")).toBe(true);
    expect(matchesRenameRule("SQ Google Pay", "StartsWith", "Google Pay")).toBe(false);
  });

  test("EndsWith anchors to the end", () => {
    expect(matchesRenameRule("SQ Bardo Jewelry", "EndsWith", "Bardo Jewelry")).toBe(true);
    expect(matchesRenameRule("Bardo Jewelry Repair", "EndsWith", "Bardo Jewelry")).toBe(false);
  });
});

describe("matchesRenameRule: comparison ignores case and surrounding whitespace", () => {
  test("case never decides a match", () => {
    expect(matchesRenameRule("china taste", "Is", "CHINA TASTE")).toBe(true);
    expect(matchesRenameRule("POS APPALACHIAN CABS", "Contains", "Appalachian Cabs")).toBe(true);
  });

  test("padding on the imported name is ignored", () => {
    expect(matchesRenameRule("  China Taste \n", "Is", "China Taste")).toBe(true);
  });

  test("the real tab-prefixed operand still matches the payee it was saved for", () => {
    expect(matchesRenameRule(
      "Vernon Heating & Air Cond",
      "Is",
      "\tVernon Heating & Air Cond",
    )).toBe(true);
  });
});

describe("matchesRenameRule: an empty operand matches nothing", () => {
  test("a blank operand does not swallow every import", () => {
    for (const operator of ["Is", "Contains", "StartsWith", "EndsWith"] as const) {
      expect(matchesRenameRule("China Taste", operator, "")).toBe(false);
      expect(matchesRenameRule("China Taste", operator, "   ")).toBe(false);
    }
  });

  test("an empty imported name matches nothing either", () => {
    expect(matchesRenameRule("", "Contains", "China Taste")).toBe(false);
  });
});

describe("resolveRenamedPayee: the tightest matching rule wins", () => {
  const exact = rule(1, "Is", "China Taste");
  const loose = rule(2, "Contains", "China");

  test("an exact rule beats another payee's Contains rule when listed second", () => {
    expect(resolveRenamedPayee("China Taste", [loose, exact])).toBe(1);
  });

  test("and beats it when listed first", () => {
    expect(resolveRenamedPayee("China Taste", [exact, loose])).toBe(1);
  });

  test("the loose rule still claims strings the exact rule does not", () => {
    expect(resolveRenamedPayee("China Garden", [loose, exact])).toBe(2);
  });

  test("an anchored rule beats a Contains rule", () => {
    const anchored = rule(3, "StartsWith", "China T");
    expect(resolveRenamedPayee("China Taste Express", [loose, anchored])).toBe(3);
  });

  test("rules of the same operator are settled by list order", () => {
    expect(resolveRenamedPayee("China Taste Express", [
      rule(4, "Contains", "Taste"),
      rule(5, "Contains", "China"),
    ])).toBe(4);
  });
});

describe("resolveRenamedPayee: an unclaimed name renames to nothing", () => {
  test("no rules at all returns null", () => {
    expect(resolveRenamedPayee("China Taste", [])).toBeNull();
  });

  test("rules that all miss return null", () => {
    expect(resolveRenamedPayee("Appalachian Cabs", [
      rule(1, "Is", "China Taste"),
      rule(2, "Contains", "Google Pay"),
    ])).toBeNull();
  });
});

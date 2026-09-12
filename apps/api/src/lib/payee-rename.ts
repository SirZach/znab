/**
 * Payee rename rules: the mapping from the payee string on an imported bank
 * file to the payee it really is. Deliberately free of database and tRPC
 * imports so the matching rules can be read, and tested, on their own.
 */

import type { PayeeRenameOperator } from "@znab/shared";

export type RenameRule = {
  payeeId: number;
  operator: PayeeRenameOperator;
  operand: string;
};

/**
 * YNAB 4 compares loosely: bank files pad and case names inconsistently, and
 * the operands users saved carry that padding with them (one real rule's
 * operand is "\tVernon Heating & Air Cond").
 */
const normalize = (value: string): string => value.trim().toLowerCase();

export function matchesRenameRule(
  importedName: string,
  operator: PayeeRenameOperator,
  operand: string,
): boolean {
  const needle = normalize(operand);
  // An empty operand is a match against nothing, not a match against
  // everything, which is what the substring operators would otherwise do.
  if (!needle) return false;

  const haystack = normalize(importedName);
  switch (operator) {
    case "Is":
      return haystack === needle;
    case "Contains":
      return haystack.includes(needle);
    case "StartsWith":
      return haystack.startsWith(needle);
    case "EndsWith":
      return haystack.endsWith(needle);
  }
}

/**
 * Tightest operator first, so a string that exactly equals one rule's operand
 * is never stolen by another rule that merely contains it. Within an operator
 * the first rule in the list wins, which leaves the caller free to impose its
 * own tie-break by ordering the query.
 */
const OPERATOR_PRECEDENCE: readonly PayeeRenameOperator[] = [
  "Is",
  "StartsWith",
  "EndsWith",
  "Contains",
];

/** The payee an imported name renames to, or null when no rule claims it. */
export function resolveRenamedPayee(importedName: string, rules: RenameRule[]): number | null {
  for (const operator of OPERATOR_PRECEDENCE) {
    for (const rule of rules) {
      if (rule.operator !== operator) continue;
      if (matchesRenameRule(importedName, rule.operator, rule.operand)) return rule.payeeId;
    }
  }
  return null;
}

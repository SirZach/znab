import { reconcileDifference } from "@znab/shared";
import { formatCurrency, parseAmountExpression } from "@/lib/utils";

/**
 * The reconcile panel's figures from what was typed as the statement balance
 * and the cleared balance as of the statement date. The statement is null until
 * something readable is typed, since a difference of nothing would read as a
 * statement that agrees; zero is a balance like any other. The difference is
 * null while either side is missing.
 */
export function reconcileFigures(
  statementText: string,
  clearedBalance: number | undefined
): { statementBalance: number | null; difference: number | null } {
  const parsed = parseAmountExpression(statementText);
  const statementBalance = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  const difference =
    statementBalance === null || clearedBalance === undefined
      ? null
      : reconcileDifference({ statementBalance, clearedBalance });
  return { statementBalance, difference };
}

/**
 * What stands between the reader and a Finish that needs no adjustment, said
 * beside the button since a disabled button shows no tooltip and touch shows
 * none at all. Which way round the gap reads follows the statement's sign: a
 * credit card owes, so clearing more of it makes the balance more negative.
 * Null once the statement agrees, or while the cleared balance loads.
 */
export function finishBlocker({
  statementBalance,
  difference,
}: {
  statementBalance: number | null;
  difference: number | null;
}): string | null {
  if (statementBalance === null) return "Enter a statement balance";
  if (difference === null || difference === 0) return null;
  const amount = formatCurrency(Math.abs(difference));
  const leftToClear = statementBalance >= 0 ? difference > 0 : difference < 0;
  return leftToClear ? `${amount} left to clear` : `Cleared is ${amount} over the statement`;
}

import { reconcileDifference } from "@znab/shared";
import { parseAmountExpression } from "@/lib/utils";

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

/**
 * Moving everything filed under one category to another, the YNAB 4 way of
 * deleting a category with history, and what that does to To Be Budgeted.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { monthlyBudgets, scheduledTransactions, subTransactions, transactions } from "@znab/db";
import { fromCents, toCents } from "@znab/shared";
import { audit } from "./audit";
import { computeBudgetMonth, monthFromIndex, monthIndex } from "./budget-math";
import { loadBudgetInputs } from "./budget-queries";
import { localToday } from "./date";
import type { Tx } from "./tx";

/**
 * Repoints transactions, split parts and scheduled transactions (soft-deleted
 * rows included) from one category to another, and adds the source's budgeted
 * amounts to the target's for the same month. A month the target had no row
 * for gets one with no overspending handling of its own, so the target's
 * sticky setting applies; the source's handling is dropped. Both ids must
 * already be proven to belong to `budgetId`. Allocation and schedule changes
 * are audited; moved transactions are not, since a category can hold
 * thousands and the audit helper pairs rows one by one.
 */
export async function reassignCategory(
  tx: Tx,
  userId: number,
  budgetId: number,
  fromId: number,
  toId: number
) {
  const now = new Date();
  await tx
    .update(transactions)
    .set({ categoryId: toId, updatedAt: now })
    .where(and(eq(transactions.budgetId, budgetId), eq(transactions.categoryId, fromId)));
  // sub_transactions carries no budget id; the category id scopes it.
  await tx
    .update(subTransactions)
    .set({ categoryId: toId, updatedAt: now })
    .where(eq(subTransactions.categoryId, fromId));

  const scheduledScope = and(
    eq(scheduledTransactions.budgetId, budgetId),
    eq(scheduledTransactions.categoryId, fromId)
  );
  const scheduledBefore = await tx.select().from(scheduledTransactions).where(scheduledScope);
  const scheduledAfter = await tx
    .update(scheduledTransactions)
    .set({ categoryId: toId, updatedAt: now })
    .where(scheduledScope)
    .returning();
  await audit(tx, userId, "scheduled_transaction", {
    before: scheduledBefore,
    after: scheduledAfter,
  });

  const sourceRows = await tx
    .select()
    .from(monthlyBudgets)
    .where(eq(monthlyBudgets.categoryId, fromId));
  const months = sourceRows.map((r) => r.month);
  const targetScope = and(eq(monthlyBudgets.categoryId, toId), inArray(monthlyBudgets.month, months));
  const targetBefore =
    months.length > 0 ? await tx.select().from(monthlyBudgets).where(targetScope) : [];

  // The ynab id takes the shape upsertMonthlyBudget gives an authored row. A
  // soft-deleted target row is revived with the moved amount alone.
  await tx.execute(sql`
    INSERT INTO monthly_budgets (ynab_id, budget_id, category_id, month, budgeted)
    SELECT 'MCB/' || to_char(month, 'YYYY-MM') || '/' || ${String(toId)}::text,
           budget_id, ${toId}::int, month, budgeted
      FROM monthly_budgets
     WHERE category_id = ${fromId} AND deleted_at IS NULL
    ON CONFLICT (category_id, month) DO UPDATE SET
      budgeted = CASE WHEN monthly_budgets.deleted_at IS NULL
                      THEN monthly_budgets.budgeted + EXCLUDED.budgeted
                      ELSE EXCLUDED.budgeted END,
      overspending_handling = CASE WHEN monthly_budgets.deleted_at IS NULL
                                   THEN monthly_budgets.overspending_handling END,
      deleted_at = NULL,
      updated_at = now()
  `);
  await tx.delete(monthlyBudgets).where(eq(monthlyBudgets.categoryId, fromId));

  const targetAfter =
    months.length > 0 ? await tx.select().from(monthlyBudgets).where(targetScope) : [];
  await audit(tx, userId, "monthly_budget", {
    before: [...sourceRows, ...targetBefore],
    after: targetAfter,
  });
}

/** A month whose To Be Budgeted a reassignment moves, by `delta` dollars. */
export type TbbChange = { month: string; delta: number };

/** To Be Budgeted for each month, as the month engine shows it. */
async function tbbByMonth(tx: Tx, budgetId: number, months: string[]) {
  const [activity, income, budgeted] = await loadBudgetInputs(tx, budgetId);
  return months.map(
    (month) =>
      computeBudgetMonth({ activity, income, budgeted, targetMonth: month }).summary
        .availableToBudget
  );
}

/**
 * Reassigns `fromId` to `toId` and reports every month whose To Be Budgeted
 * moved, from the source's first month of activity or budget through the
 * current month (or the source's last month, if later). Totals budgeted never
 * change, but a non-confined deficit is taken out of next month's To Be
 * Budgeted category by category, so merging an overspent source into a target
 * with money nets the two and changes it. The caller owns the transaction and
 * decides whether the reassignment stands.
 */
export async function reassignWithImpact(
  tx: Tx,
  userId: number,
  budgetId: number,
  fromId: number,
  toId: number
): Promise<{ changes: TbbChange[]; throughMonth: string }> {
  const [activity, , budgeted] = await loadBudgetInputs(tx, budgetId);
  const sourceMonths = [
    ...activity.filter((r) => Number(r.categoryId) === fromId).map((r) => r.month),
    ...budgeted.filter((r) => Number(r.categoryId) === fromId).map((r) => r.month),
  ].map(monthIndex);
  const current = monthIndex(localToday().slice(0, 7));
  const last = Math.max(current, ...sourceMonths);
  const months =
    sourceMonths.length === 0
      ? []
      : Array.from({ length: last - Math.min(...sourceMonths) + 1 }, (_, i) =>
          monthFromIndex(Math.min(...sourceMonths) + i)
        );

  const before = await tbbByMonth(tx, budgetId, months);
  await reassignCategory(tx, userId, budgetId, fromId, toId);
  const after = await tbbByMonth(tx, budgetId, months);

  const changes: TbbChange[] = [];
  months.forEach((month, i) => {
    const delta = toCents(after[i]!) - toCents(before[i]!);
    if (delta !== 0) changes.push({ month, delta: fromCents(delta) });
  });
  return { changes, throughMonth: monthFromIndex(last) };
}

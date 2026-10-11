/**
 * The reads the month engine runs on, shared by every router that has to
 * reason about a month so they cannot drift apart.
 */
import { sql } from "drizzle-orm";
import { monthlyBudgets } from "@znab/db";
import type { AuthedContext } from "./authz";
import type { ActivityRow, BudgetedRow, IncomeRow } from "./budget-math";
import { IS_INCOME, onBudgetMoneySource } from "./money-source";
import type { Tx } from "./tx";

/**
 * Every row that counts towards a category's activity, one per transaction or
 * split part. The month engine totals these and the Spent drill-down lists
 * them, so the two read the same rows and cannot disagree.
 *
 * Credit and cash spending are not told apart: YNAB 4 takes non-confined
 * overspending out of next month's To be Budgeted whichever account paid for
 * it (see `rollCategory` in budget-math).
 */
export function categoryActivitySource(budgetId: number) {
  return sql`
    SELECT transaction_id, sub_transaction_id, category_id, d, amount, account_id, payee_id, memo
    FROM (${onBudgetMoneySource(budgetId)}) m
    WHERE category_id IS NOT NULL
  `;
}

/** The three raw series the month engine runs on, for a whole budget's history. */
export function loadBudgetInputs(db: AuthedContext["db"], budgetId: number) {
  return Promise.all([
    // Category spending and refunds per month.
    db.execute(sql`
      SELECT
        category_id AS "categoryId",
        to_char(date_trunc('month', d), 'YYYY-MM') AS month,
        sum(amount) AS amount
      FROM (${categoryActivitySource(budgetId)}) x
      GROUP BY category_id, date_trunc('month', d)
    `) as unknown as Promise<ActivityRow[]>,
    // Money entering "To be Budgeted". Immediate income lands in its own
    // month; deferred income is held for the following month.
    db.execute(sql`
      SELECT
        to_char(date_trunc('month', d), 'YYYY-MM') AS month,
        category_ynab_id AS kind,
        sum(amount) AS amount
      FROM (${onBudgetMoneySource(budgetId)}) x
      WHERE ${IS_INCOME}
      GROUP BY date_trunc('month', d), category_ynab_id
    `) as unknown as Promise<IncomeRow[]>,
    db.execute(sql`
      SELECT
        to_char(month, 'YYYY-MM') AS month,
        category_id AS "categoryId",
        budgeted,
        overspending_handling AS "overspendingHandling"
      FROM monthly_budgets
      WHERE budget_id = ${budgetId} AND deleted_at IS NULL
    `) as unknown as Promise<BudgetedRow[]>,
  ]);
}

/**
 * Writes one category's allocation row for a month, creating it on first use.
 * Only the fields in `set` change on an existing row; a new row starts with
 * nothing budgeted unless `set` says otherwise. The ynab id is the shape YNAB 4
 * gives a monthly category budget, so an authored row matches an imported one.
 */
export async function upsertMonthlyBudget(
  db: AuthedContext["db"] | Tx,
  key: { budgetId: number; categoryId: number; month: string },
  set: { budgeted?: string; overspendingHandling?: string }
) {
  await db
    .insert(monthlyBudgets)
    .values({
      ynabId: `MCB/${key.month.slice(0, 7)}/${key.categoryId}`,
      budgetId: key.budgetId,
      categoryId: key.categoryId,
      month: key.month,
      budgeted: "0",
      ...set,
    })
    .onConflictDoUpdate({
      target: [monthlyBudgets.categoryId, monthlyBudgets.month],
      set: { ...set, updatedAt: new Date() },
    });
}

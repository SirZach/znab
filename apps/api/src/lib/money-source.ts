/**
 * The one definition of "money that moved through the budget", shared by the
 * budget page and the reports so the two cannot disagree. Builds SQL only: no
 * database connection is opened here.
 */
import { sql, type SQL } from "drizzle-orm";
import { DEFERRED_INCOME, IMMEDIATE_INCOME } from "@znab/shared";

/**
 * Every row of budget money, one per transaction or split part, with columns
 * `transaction_id`, `sub_transaction_id`, `category_id`, `category_ynab_id`,
 * `d`, `amount`, `account_type`, `account_id`, `payee_id` and `memo`.
 *
 * Only on-budget accounts count. A split counts through its parts, not its
 * parent, and a part is dated, placed and paid like its parent row. Transfers
 * are included: one between two budget accounts carries no category, so it
 * drops out of any category total by itself, while one out to a tracking
 * account carries a category and is spending, as YNAB 4 counts it (see
 * `transferCategoryId`).
 *
 * `since` and `accountIds` narrow it to a report's date range and accounts.
 */
export function onBudgetMoneySource(
  budgetId: number,
  opts: { since?: string | null; accountIds?: number[] } = {}
): SQL {
  const narrow = sql`${opts.since ? sql`AND t.date >= ${opts.since}::date` : sql``} ${andIdsIn(sql`t.account_id`, opts.accountIds)}`;
  return sql`
    SELECT
      t.id AS transaction_id, NULL::int AS sub_transaction_id,
      t.category_id, t.category_ynab_id, t.date AS d, t.amount,
      a.account_type, t.account_id, t.payee_id, t.memo
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.budget_id = ${budgetId}
      AND t.deleted_at IS NULL AND a.deleted_at IS NULL
      AND a.on_budget = true AND t.is_split = false
      ${narrow}
    UNION ALL
    SELECT
      t.id, s.id,
      s.category_id, s.category_ynab_id, t.date, s.amount,
      a.account_type, t.account_id, t.payee_id, s.memo
    FROM sub_transactions s
    JOIN transactions t ON t.id = s.transaction_id
    JOIN accounts a ON a.id = t.account_id
    WHERE t.budget_id = ${budgetId}
      AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND a.deleted_at IS NULL
      AND a.on_budget = true
      ${narrow}
  `;
}

/** `AND column IN (ids)`, or nothing when no ids are given, which means all of them. */
export function andIdsIn(column: SQL, ids: number[] | undefined): SQL {
  if (!ids?.length) return sql``;
  return sql`AND ${column} IN (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  )})`;
}

/** True for a row filed under one of YNAB 4's two income categories. */
export const IS_INCOME = sql`category_ynab_id IN (${IMMEDIATE_INCOME}, ${DEFERRED_INCOME})`;

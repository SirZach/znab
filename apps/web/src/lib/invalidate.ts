/**
 * The one place that decides what goes stale after a write. Whole routers are
 * invalidated rather than single procedures: only mounted queries refetch, so
 * marking too much stale costs little, while missing one shows wrong numbers.
 */

type Invalidatable = { invalidate: () => Promise<unknown> };

const MONEY_ROUTERS = [
  "account",
  "budget",
  "category",
  "householdSplit",
  "payee",
  "report",
  "scheduledTransaction",
] as const;

/** The slice of `trpc.useUtils()` these helpers touch. */
export type InvalidateUtils = Record<(typeof MONEY_ROUTERS)[number], Invalidatable>;

/**
 * After anything that changes transactions, accounts, categories, payees or
 * schedules: registers, balances, the budget, reports and the household split
 * all read from those.
 */
export function invalidateMoney(utils: InvalidateUtils) {
  return Promise.all(MONEY_ROUTERS.map((r) => utils[r].invalidate()));
}

/**
 * After a budgeting write (budgeted, moves, goals, overspending, hidden). It
 * touches no transaction, so only the budget and the household split, which
 * reads what was budgeted, go stale.
 */
export function invalidateBudgeting(utils: InvalidateUtils) {
  return Promise.all([utils.budget.invalidate(), utils.householdSplit.invalidate()]);
}

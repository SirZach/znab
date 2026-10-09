/**
 * YNAB 4's monthly budget math. Deliberately free of database and tRPC imports
 * so the rules can be read, and tested, on their own.
 */

import {
  DEFERRED_INCOME,
  fromCents,
  type GoalType,
  type OverspendKind,
  toCents,
} from "@znab/shared";

export type ActivityRow = { categoryId: number; month: string; credit: string; cash: string };
export type IncomeRow = { month: string; kind: string; amount: string };
export type BudgetedRow = {
  month: string;
  categoryId: number;
  budgeted: string;
  overspendingHandling: string | null;
};

export type MonthSummary = {
  month: string; // "YYYY-MM"
  notBudgeted: number; // last month's Available to Budget, carried forward
  overspentPrev: number; // cash overspending in the previous month (positive)
  income: number; // income available to budget this month
  budgeted: number; // total budgeted across all categories this month
  budgetedFuture: number; // total budgeted in every month after this one
  availableToBudget: number;
};

/** A single category's state for one month (dollars). */
export type CategoryMonth = {
  budgeted: number; // budgeted this month
  activity: number; // outflows/inflows this month (negative = spent)
  available: number; // month-end balance, carried forward
  overspendKind: OverspendKind; // null unless `available` is negative
  confined: boolean; // overspending stays here instead of hitting To-be-Budgeted
};

export type BudgetMonth = {
  summary: MonthSummary;
  categories: Map<number, CategoryMonth>;
};

/**
 * Zero-based month index for "YYYY-MM", and its inverse. Exported so callers
 * that walk a month range (the router's category history query) share this
 * instead of re-deriving month arithmetic.
 */
export const monthIndex = (ym: string): number => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
};
export const monthFromIndex = (idx: number): string =>
  `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;

const zeroSummary = (month: string): MonthSummary => ({
  month,
  notBudgeted: 0,
  overspentPrev: 0,
  income: 0,
  budgeted: 0,
  budgetedFuture: 0,
  availableToBudget: 0,
});

type Activity = { credit: number; cash: number };
// `handling` is YNAB 4's raw per-month flag: "Confined", "AffectsBuffer" or
// null. YNAB 4 only writes it in the month it was toggled, so null means "same
// as last month" and the setting carries forward until changed.
type Budgeted = { budgeted: number; handling: string | null };

/**
 * One category's month-end roll-up (cents). `balance` is the raw end-of-month
 * available (shown in the grid, may be negative); `overspend` is the shortfall
 * that hits next month's To-be-Budgeted and resets the category. Credit card
 * spending counts the same as cash here, which is what YNAB 4 does: only a
 * confined category keeps its deficit out of To-be-Budgeted.
 */
function rollCategory(
  prior: number,
  b: Budgeted | undefined,
  act: Activity | undefined,
  confined: boolean
) {
  const budgeted = b?.budgeted ?? 0;
  const activity = (act?.credit ?? 0) + (act?.cash ?? 0);
  const balance = prior + budgeted + activity;
  const deficit = balance < 0 ? -balance : 0;
  const overspend = confined ? 0 : deficit;
  const overspendKind: OverspendKind = deficit === 0 ? null : confined ? "confined" : "cash";

  return { budgeted, activity, balance, overspend, overspendKind };
}

/**
 * Reproduces YNAB4's budget math by walking every month from the budget's start
 * to the target month, carrying each category's balance forward. Returns both
 * the "Available to Budget" summary and each category's end-of-month state for
 * the target month, so the grid and the header share one engine.
 *
 * Available(m) = Available(m-1) + Income(m) - Budgeted(m) - CashOverspent(m-1)
 */
export function computeBudgetMonth(args: {
  activity: ActivityRow[];
  income: IncomeRow[];
  budgeted: BudgetedRow[];
  targetMonth: string; // "YYYY-MM"
}): BudgetMonth {
  const { activity, income, budgeted, targetMonth } = args;

  // Index inputs by month (all amounts in integer cents).
  const activityByMonth = new Map<string, Map<number, Activity>>();
  for (const r of activity) {
    let m = activityByMonth.get(r.month);
    if (!m) {
      m = new Map();
      activityByMonth.set(r.month, m);
    }
    m.set(r.categoryId, { credit: toCents(r.credit), cash: toCents(r.cash) });
  }

  const budgetedByMonth = new Map<string, Map<number, Budgeted>>();
  const budgetedTotal = new Map<string, number>();
  for (const r of budgeted) {
    let m = budgetedByMonth.get(r.month);
    if (!m) {
      m = new Map();
      budgetedByMonth.set(r.month, m);
    }
    const amt = toCents(r.budgeted);
    m.set(r.categoryId, { budgeted: amt, handling: r.overspendingHandling });
    budgetedTotal.set(r.month, (budgetedTotal.get(r.month) ?? 0) + amt);
  }

  // Income(m) = immediate income dated in m + deferred income dated in m-1.
  const incomeByMonth = new Map<string, number>();
  for (const r of income) {
    const month = r.kind === DEFERRED_INCOME ? monthFromIndex(monthIndex(r.month) + 1) : r.month;
    incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + toCents(r.amount));
  }

  // Earliest month any money moves, so the carry-forward starts from zero.
  const allMonths = [
    ...activityByMonth.keys(),
    ...budgetedByMonth.keys(),
    ...incomeByMonth.keys(),
  ];
  const startIdx = Math.min(...allMonths.map(monthIndex));
  const targetIdx = monthIndex(targetMonth);
  // No activity at all, or the target predates the budget, so nothing has happened.
  if (allMonths.length === 0 || targetIdx < startIdx) {
    return { summary: zeroSummary(targetMonth), categories: new Map() };
  }

  // Money already committed to later months is not available to budget now.
  // This is a display-only adjustment for the target month: it must not feed
  // the carry-forward, or the same dollars would be subtracted again when that
  // later month is viewed and counts them as its own "Budgeted".
  let budgetedFuture = 0;
  for (const [m, amt] of budgetedTotal) {
    if (monthIndex(m) > targetIdx) budgetedFuture += amt;
  }

  const balances = new Map<number, number>(); // categoryId -> carried cents
  const confinedById = new Map<number, boolean>(); // sticky overspending handling
  let available = 0; // To-be-Budgeted carried into the current month
  let prevCashOverspent = 0;

  for (let idx = startIdx; idx <= targetIdx; idx++) {
    const m = monthFromIndex(idx);
    const inc = incomeByMonth.get(m) ?? 0;
    const bud = budgetedTotal.get(m) ?? 0;
    const actM = activityByMonth.get(m);
    const budM = budgetedByMonth.get(m);
    const touched = new Set<number>([...(actM?.keys() ?? []), ...(budM?.keys() ?? [])]);
    for (const [catId, b] of budM ?? []) {
      if (b.handling) confinedById.set(catId, b.handling === "Confined");
    }

    // Available(m) = Available(m-1) + Income(m) - Budgeted(m) - CashOverspent(m-1)
    const prevAvailable = available;
    available = available + inc - bud - prevCashOverspent;

    if (idx === targetIdx) {
      // Per-category state for the displayed month uses the raw (pre-reset)
      // balance: an overspent category shows negative this month and only
      // resets going into the next one.
      const categories = new Map<number, CategoryMonth>();
      for (const [catId, bal] of balances) {
        // Nothing happened here this month, so a negative balance was carried:
        // only a confined category survives the roll-forward still negative.
        categories.set(catId, {
          budgeted: 0,
          activity: 0,
          available: fromCents(bal),
          overspendKind: bal < 0 ? "confined" : null,
          confined: confinedById.get(catId) ?? false,
        });
      }
      for (const catId of touched) {
        const confined = confinedById.get(catId) ?? false;
        const r = rollCategory(balances.get(catId) ?? 0, budM?.get(catId), actM?.get(catId), confined);
        categories.set(catId, {
          budgeted: fromCents(r.budgeted),
          activity: fromCents(r.activity),
          available: fromCents(r.balance),
          overspendKind: r.overspendKind,
          confined,
        });
      }
      return {
        summary: {
          month: targetMonth,
          notBudgeted: fromCents(prevAvailable),
          overspentPrev: fromCents(prevCashOverspent),
          income: fromCents(inc),
          budgeted: fromCents(bud),
          budgetedFuture: fromCents(budgetedFuture),
          availableToBudget: fromCents(available - budgetedFuture),
        },
        categories,
      };
    }

    // Roll category balances forward and tally overspending, which is deducted
    // on the next iteration.
    let cashOverspent = 0;
    for (const catId of touched) {
      const confined = confinedById.get(catId) ?? false;
      const r = rollCategory(balances.get(catId) ?? 0, budM?.get(catId), actM?.get(catId), confined);
      cashOverspent += r.overspend;
      balances.set(catId, r.balance + r.overspend); // overspending hits TBB; confined carries
    }
    prevCashOverspent = cashOverspent;
  }

  // Unreachable: the loop returns at targetIdx.
  return { summary: zeroSummary(targetMonth), categories: new Map() };
}

// ─── Category Goals ───────────────────────────────────────────────────────────

/** A category's goal progress for one month (dollars). */
export type CategoryGoal = {
  type: GoalType;
  target: number;
  targetMonth: string | null; // "YYYY-MM", only set for TBD
  neededThisMonth: number; // what to budget this month to stay on track
  underFunded: number; // how far the goal still is from being met
  percent: number; // 0..1, funding progress toward the goal
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Goal progress for one category in one month, mirroring YNAB 4's three goal
 * types. `budgeted` and `available` are the same figures computeBudgetMonth
 * already produces for the category, so this only adds the goal math on top.
 *
 * - MF (budget this much every month): judged against what is budgeted this
 *   month alone, no memory of prior months.
 * - TB (get the balance to X): judged against the month-end balance, so money
 *   already sitting in the category counts, not just this month's budgeting.
 * - TBD (get the balance to X by date): the same as TB but the remaining gap
 *   is spread evenly over the months left, including the target month itself.
 */
export function computeCategoryGoal(args: {
  type: GoalType;
  target: number; // dollars
  targetMonth: string | null; // "YYYY-MM", required for TBD
  budgeted: number; // dollars, this month
  available: number; // dollars, this month's month-end balance
  currentMonth: string; // "YYYY-MM"
}): CategoryGoal {
  const { type, targetMonth, currentMonth } = args;
  const target = toCents(args.target);
  const budgeted = toCents(args.budgeted);
  const available = toCents(args.available);

  let neededThisMonth: number;
  let underFunded: number;
  let percent: number;

  if (type === "MF") {
    neededThisMonth = target;
    underFunded = Math.max(0, target - budgeted);
    percent = target > 0 ? clamp01(budgeted / target) : 0;
  } else if (type === "TB") {
    // The balance before this month's budgeting is what the prior months left
    // behind, which is what still needs covering to hit the target today.
    const balanceBefore = available - budgeted;
    neededThisMonth = Math.max(0, target - balanceBefore);
    underFunded = Math.max(0, target - available);
    percent = target > 0 ? clamp01(available / target) : 0;
  } else {
    // TBD: spread the remaining need across every month up to and including
    // the target month. A target month already in the past leaves one month
    // to close the whole gap rather than dividing by zero or a negative span.
    const monthsLeft = Math.max(
      1,
      monthIndex(targetMonth ?? currentMonth) - monthIndex(currentMonth) + 1
    );
    const balanceBefore = available - budgeted;
    neededThisMonth = Math.round(Math.max(0, (target - balanceBefore) / monthsLeft));
    underFunded = Math.max(0, neededThisMonth - budgeted);
    percent = target > 0 ? clamp01(available / target) : 0;
  }

  return {
    type,
    target: fromCents(target),
    targetMonth,
    neededThisMonth: fromCents(Math.round(neededThisMonth)),
    underFunded: fromCents(Math.round(underFunded)),
    percent,
  };
}

// ─── Quick Budget ─────────────────────────────────────────────────────────────

/** How many months back the averages look. */
export const QUICK_BUDGET_LOOKBACK = 12;

/**
 * The amounts behind YNAB 4's Quick Budget buttons, for one category in one
 * month. Every figure is an amount to *set* the category's budget to, so the
 * caller can hand any of them straight to setBudgeted.
 */
export type QuickBudgetAmounts = {
  budgetedLastMonth: number;
  spentLastMonth: number;
  averageBudgeted: number;
  averageSpent: number;
  /** Budget needed to bring this month's Available to exactly zero. */
  balanceToZero: number;
};

export function computeQuickBudget(args: {
  activity: ActivityRow[];
  income: IncomeRow[];
  budgeted: BudgetedRow[];
  targetMonth: string; // "YYYY-MM"
  categoryId: number;
}): QuickBudgetAmounts {
  const { activity, income, budgeted, targetMonth, categoryId } = args;
  const targetIdx = monthIndex(targetMonth);
  const prevMonth = monthFromIndex(targetIdx - 1);

  const mine = budgeted.filter((r) => r.categoryId === categoryId);
  const myActivity = activity.filter((r) => r.categoryId === categoryId);

  // Outflow for a month as a positive amount. A category that took in more than
  // it spent (a refund) counts as zero rather than a negative budget.
  const spentIn = (month: string) => {
    const row = myActivity.find((r) => r.month === month);
    if (!row) return 0;
    const net = toCents(row.cash) + toCents(row.credit);
    return net < 0 ? -net : 0;
  };
  const budgetedIn = (month: string) =>
    toCents(mine.find((r) => r.month === month)?.budgeted);

  // Averages run over the months in the lookback window that the category was
  // actually in use, so a category only a few months old is not averaged down
  // by a year of zeroes it never existed for.
  const window: string[] = [];
  for (let i = 1; i <= QUICK_BUDGET_LOOKBACK; i++) {
    window.push(monthFromIndex(targetIdx - i));
  }
  const mean = (values: number[]) =>
    values.length === 0
      ? 0
      : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  const budgetedMonths = new Set(mine.map((r) => r.month));
  const activityMonths = new Set(myActivity.map((r) => r.month));

  const averageBudgeted = mean(
    window.filter((m) => budgetedMonths.has(m)).map(budgetedIn)
  );
  const averageSpent = mean(
    window.filter((m) => activityMonths.has(m)).map(spentIn)
  );

  // Available = budgeted + everything else, so the budget that zeroes it out is
  // this month's budget less whatever is currently left over.
  const month = computeBudgetMonth({ activity, income, budgeted, targetMonth });
  const current = month.categories.get(categoryId);
  const balanceToZero =
    toCents(current?.budgeted) - toCents(current?.available);

  return {
    budgetedLastMonth: fromCents(budgetedIn(prevMonth)),
    spentLastMonth: fromCents(spentIn(prevMonth)),
    averageBudgeted: fromCents(averageBudgeted),
    averageSpent: fromCents(averageSpent),
    balanceToZero: fromCents(balanceToZero),
  };
}

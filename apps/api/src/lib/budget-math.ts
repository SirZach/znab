/**
 * YNAB 4's monthly budget math. Deliberately free of database and tRPC imports
 * so the rules can be read, and tested, on their own.
 */

export const IMMEDIATE_INCOME = "Category/__ImmediateIncome__";
export const DEFERRED_INCOME = "Category/__DeferredIncome__";

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

/**
 * How a category's negative balance was funded, which is what separates red
 * from orange in YNAB 4: cash overspending comes out of next month's
 * To-be-Budgeted, credit overspending is just debt sitting on the card.
 */
export type OverspendKind = "cash" | "credit" | null;

/** A single category's state for one month (dollars). */
export type CategoryMonth = {
  budgeted: number; // budgeted this month
  activity: number; // outflows/inflows this month (negative = spent)
  available: number; // month-end balance, carried forward
  overspendKind: OverspendKind; // null unless `available` is negative
};

export type BudgetMonth = {
  summary: MonthSummary;
  categories: Map<number, CategoryMonth>;
};

const cents = (v: string | number | null | undefined) =>
  Math.round(parseFloat(String(v ?? 0)) * 100);

/** Zero-based month index for "YYYY-MM", and its inverse. */
const monthIndex = (ym: string): number => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
};
const monthFromIndex = (idx: number): string =>
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
type Budgeted = { budgeted: number; confined: boolean };

/**
 * One category's month-end roll-up (cents). `balance` is the raw end-of-month
 * available (shown in the grid, may be negative); `cashOverspend` is the cash
 * shortfall that hits next month's To-be-Budgeted and resets the category.
 *
 * A carried-forward negative balance is always credit/confined debt (cash
 * overspending resets a category to zero), so only a *positive* prior balance
 * and this month's budget provide spendable cash; credit-card outflows are
 * self-funding debt. Cash overspend is cash outflows beyond those funds, capped
 * at the month-end deficit. "Confined" overspending never hits TBB.
 */
function rollCategory(prior: number, b: Budgeted | undefined, act: Activity | undefined) {
  const budgeted = b?.budgeted ?? 0;
  const credit = act?.credit ?? 0;
  const cash = act?.cash ?? 0;
  const balance = prior + budgeted + credit + cash;

  const cashOut = cash < 0 ? -cash : 0;
  const funds = Math.max(prior, 0) + budgeted + (cash > 0 ? cash : 0) + (credit > 0 ? credit : 0);
  const deficit = balance < 0 ? -balance : 0;
  const rawCashOverspend = Math.min(Math.max(cashOut - funds, 0), deficit);
  const cashOverspend = b?.confined ? 0 : rawCashOverspend;

  // Classify by funding source, before "Confined" is applied: confining changes
  // who absorbs the overspending, not what paid for it.
  const overspendKind: OverspendKind =
    deficit === 0 ? null : rawCashOverspend > 0 ? "cash" : "credit";

  return { budgeted, activity: credit + cash, balance, cashOverspend, overspendKind };
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
    if (!m) activityByMonth.set(r.month, (m = new Map()));
    m.set(r.categoryId, { credit: cents(r.credit), cash: cents(r.cash) });
  }

  const budgetedByMonth = new Map<string, Map<number, Budgeted>>();
  const budgetedTotal = new Map<string, number>();
  for (const r of budgeted) {
    let m = budgetedByMonth.get(r.month);
    if (!m) budgetedByMonth.set(r.month, (m = new Map()));
    const amt = cents(r.budgeted);
    m.set(r.categoryId, { budgeted: amt, confined: r.overspendingHandling === "Confined" });
    budgetedTotal.set(r.month, (budgetedTotal.get(r.month) ?? 0) + amt);
  }

  // Income(m) = immediate income dated in m + deferred income dated in m-1.
  const incomeByMonth = new Map<string, number>();
  for (const r of income) {
    const month = r.kind === DEFERRED_INCOME ? monthFromIndex(monthIndex(r.month) + 1) : r.month;
    incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + cents(r.amount));
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
  let available = 0; // To-be-Budgeted carried into the current month
  let prevCashOverspent = 0;

  for (let idx = startIdx; idx <= targetIdx; idx++) {
    const m = monthFromIndex(idx);
    const inc = incomeByMonth.get(m) ?? 0;
    const bud = budgetedTotal.get(m) ?? 0;
    const actM = activityByMonth.get(m);
    const budM = budgetedByMonth.get(m);
    const touched = new Set<number>([...(actM?.keys() ?? []), ...(budM?.keys() ?? [])]);

    // Available(m) = Available(m-1) + Income(m) - Budgeted(m) - CashOverspent(m-1)
    const prevAvailable = available;
    available = available + inc - bud - prevCashOverspent;

    if (idx === targetIdx) {
      // Per-category state for the displayed month uses the raw (pre-reset)
      // balance: an overspent category shows negative this month and only
      // resets going into the next one.
      const categories = new Map<number, CategoryMonth>();
      for (const [catId, bal] of balances) {
        // Nothing happened here this month, so a negative balance is debt that
        // carried: cash overspending is settled against To-be-Budgeted at month
        // end and only the credit/confined part survives the roll-forward.
        categories.set(catId, {
          budgeted: 0,
          activity: 0,
          available: bal / 100,
          overspendKind: bal < 0 ? "credit" : null,
        });
      }
      for (const catId of touched) {
        const r = rollCategory(balances.get(catId) ?? 0, budM?.get(catId), actM?.get(catId));
        categories.set(catId, {
          budgeted: r.budgeted / 100,
          activity: r.activity / 100,
          available: r.balance / 100,
          overspendKind: r.overspendKind,
        });
      }
      return {
        summary: {
          month: targetMonth,
          notBudgeted: prevAvailable / 100,
          overspentPrev: prevCashOverspent / 100,
          income: inc / 100,
          budgeted: bud / 100,
          budgetedFuture: budgetedFuture / 100,
          availableToBudget: (available - budgetedFuture) / 100,
        },
        categories,
      };
    }

    // Roll category balances forward and tally cash overspending, which is
    // deducted on the next iteration.
    let cashOverspent = 0;
    for (const catId of touched) {
      const r = rollCategory(balances.get(catId) ?? 0, budM?.get(catId), actM?.get(catId));
      cashOverspent += r.cashOverspend;
      balances.set(catId, r.balance + r.cashOverspend); // cash part hits TBB; debt carries
    }
    prevCashOverspent = cashOverspent;
  }

  // Unreachable: the loop returns at targetIdx.
  return { summary: zeroSummary(targetMonth), categories: new Map() };
}

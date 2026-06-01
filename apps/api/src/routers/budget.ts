import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { budgets, monthlyBudgets, categories } from "@znab/db";
import { setBudgetedSchema } from "@znab/shared";

const IMMEDIATE_INCOME = "Category/__ImmediateIncome__";
const DEFERRED_INCOME = "Category/__DeferredIncome__";

export const budgetRouter = router({
  // List all budgets for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.budgets.findMany({
      where: eq(budgets.userId, ctx.user.id),
      orderBy: (b, { asc }) => [asc(b.name)],
    });
  }),

  // Get a single budget by id (must belong to user)
  byId: protectedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const budget = await ctx.db.query.budgets.findFirst({
        where: and(
          eq(budgets.id, input.budgetId),
          eq(budgets.userId, ctx.user.id)
        ),
      });
      if (!budget) throw new Error("Budget not found");
      return budget;
    }),

  // Get all months that have data for a budget
  months: protectedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .selectDistinct({ month: monthlyBudgets.month })
        .from(monthlyBudgets)
        .where(
          and(
            eq(monthlyBudgets.budgetId, input.budgetId),
            isNull(monthlyBudgets.deletedAt)
          )
        )
        .orderBy(monthlyBudgets.month);
      return rows.map((r) => r.month);
    }),

  // Get category groups + categories + monthly allocations for a given month
  monthData: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        // ISO date string, first of month: "2026-03-01"
        month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ ctx, input }) => {
      const groups = await ctx.db.query.categoryGroups.findMany({
        where: (cg, { eq, and, isNull }) =>
          and(eq(cg.budgetId, input.budgetId), isNull(cg.deletedAt)),
        orderBy: (cg, { asc }) => [asc(cg.sortOrder)],
        with: {
          categories: {
            where: (c, { isNull }) => isNull(c.deletedAt),
            orderBy: (c, { asc }) => [asc(c.sortOrder)],
          },
        },
      });

      const allocations = await ctx.db.query.monthlyBudgets.findMany({
        where: (mb, { eq, and, isNull }) =>
          and(
            eq(mb.budgetId, input.budgetId),
            eq(mb.month, input.month),
            isNull(mb.deletedAt)
          ),
      });

      const allocationMap = new Map(
        allocations.map((a) => [a.categoryId, a])
      );

      return groups.map((group) => ({
        ...group,
        categories: group.categories.map((cat) => ({
          ...cat,
          allocation: allocationMap.get(cat.id) ?? null,
        })),
      }));
    }),

  // Full budget view for a single month: category groups + each category's
  // month-end balance/activity + the "Available to Budget" summary, all from one
  // rolling pass so the grid and the header stay consistent. Cash overspending
  // (which reduces next month's funds) is separated from credit-card / other
  // on-budget-liability overspending (which becomes debt and does not).
  monthBudget: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // first-of-month
      })
    )
    .query(async ({ ctx, input }) => {
      // Outflows on a credit card or other on-budget liability become debt, so
      // they are classified separately from cash for overspending purposes.
      const klass = sql`CASE WHEN a.account_type IN ('CreditCard', 'OtherLiability') THEN 'credit' ELSE 'cash' END`;

      // All five reads are independent, so issue them together.
      const [budget, groups, activity, income, budgetedRows] = await Promise.all([
        ctx.db.query.budgets.findFirst({
          where: and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id)),
        }),
        ctx.db.query.categoryGroups.findMany({
          where: (cg, { eq, and, isNull }) =>
            and(eq(cg.budgetId, input.budgetId), isNull(cg.deletedAt)),
          orderBy: (cg, { asc }) => [asc(cg.sortOrder)],
          with: {
            categories: {
              where: (c, { isNull }) => isNull(c.deletedAt),
              orderBy: (c, { asc }) => [asc(c.sortOrder)],
            },
          },
        }),
        // Category spending/refunds per month, split by funding source. Only
        // on-budget accounts affect the budget. Splits contribute via their
        // sub-transactions, not the parent.
        ctx.db.execute(sql`
          SELECT
            category_id AS "categoryId",
            to_char(date_trunc('month', d), 'YYYY-MM') AS month,
            COALESCE(sum(amount) FILTER (WHERE klass = 'credit'), 0) AS credit,
            COALESCE(sum(amount) FILTER (WHERE klass = 'cash'), 0)   AS cash
          FROM (
            SELECT t.category_id, t.date AS d, t.amount, ${klass} AS klass
            FROM transactions t
            JOIN accounts a ON a.id = t.account_id
            WHERE t.budget_id = ${input.budgetId}
              AND t.deleted_at IS NULL AND a.deleted_at IS NULL
              AND a.on_budget = true AND t.is_split = false
              AND t.category_id IS NOT NULL
            UNION ALL
            SELECT s.category_id, t.date AS d, s.amount, ${klass} AS klass
            FROM sub_transactions s
            JOIN transactions t ON t.id = s.transaction_id
            JOIN accounts a ON a.id = t.account_id
            WHERE t.budget_id = ${input.budgetId}
              AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND a.deleted_at IS NULL
              AND a.on_budget = true AND s.category_id IS NOT NULL
          ) x
          GROUP BY category_id, date_trunc('month', d)
        `) as unknown as Promise<ActivityRow[]>,
        // Money entering "To be Budgeted". Immediate income lands in its own
        // month; deferred income is held for the following month.
        ctx.db.execute(sql`
          SELECT
            to_char(date_trunc('month', d), 'YYYY-MM') AS month,
            kind,
            sum(amount) AS amount
          FROM (
            SELECT t.date AS d, t.category_ynab_id AS kind, t.amount
            FROM transactions t
            JOIN accounts a ON a.id = t.account_id
            WHERE t.budget_id = ${input.budgetId}
              AND t.deleted_at IS NULL AND a.deleted_at IS NULL AND a.on_budget = true
              AND t.is_split = false
              AND t.category_ynab_id IN (${IMMEDIATE_INCOME}, ${DEFERRED_INCOME})
            UNION ALL
            SELECT t.date AS d, s.category_ynab_id AS kind, s.amount
            FROM sub_transactions s
            JOIN transactions t ON t.id = s.transaction_id
            JOIN accounts a ON a.id = t.account_id
            WHERE t.budget_id = ${input.budgetId}
              AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND a.deleted_at IS NULL
              AND a.on_budget = true
              AND s.category_ynab_id IN (${IMMEDIATE_INCOME}, ${DEFERRED_INCOME})
          ) x
          GROUP BY date_trunc('month', d), kind
        `) as unknown as Promise<IncomeRow[]>,
        ctx.db.execute(sql`
          SELECT
            to_char(month, 'YYYY-MM') AS month,
            category_id AS "categoryId",
            budgeted,
            overspending_handling AS "overspendingHandling"
          FROM monthly_budgets
          WHERE budget_id = ${input.budgetId} AND deleted_at IS NULL
        `) as unknown as Promise<BudgetedRow[]>,
      ]);
      if (!budget) throw new Error("Budget not found");

      const { summary, categories } = computeBudgetMonth({
        activity,
        income,
        budgeted: budgetedRows,
        targetMonth: input.month.slice(0, 7),
      });

      return {
        summary,
        groups: groups.map((group) => ({
          ...group,
          categories: group.categories.map((cat) => {
            const cm = categories.get(cat.id);
            return {
              ...cat,
              budgeted: cm?.budgeted ?? 0,
              activity: cm?.activity ?? 0,
              available: cm?.available ?? 0,
            };
          }),
        })),
      };
    }),

  // Set the budgeted amount for a category in a month
  setBudgeted: protectedProcedure
    .input(setBudgetedSchema.extend({ budgetId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(monthlyBudgets)
        .values({
          ynabId: `MCB/${input.month.slice(0, 7)}/${input.categoryId}`,
          budgetId: input.budgetId,
          categoryId: input.categoryId,
          month: input.month,
          budgeted: String(input.budgeted),
        })
        .onConflictDoUpdate({
          target: [monthlyBudgets.categoryId, monthlyBudgets.month],
          set: { budgeted: String(input.budgeted), updatedAt: new Date() },
        });
    }),
});

// ─── Month-summary engine ─────────────────────────────────────────────────────

type ActivityRow = { categoryId: number; month: string; credit: string; cash: string };
type IncomeRow = { month: string; kind: string; amount: string };
type BudgetedRow = {
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
  availableToBudget: number;
};

/** A single category's state for one month (dollars). */
export type CategoryMonth = {
  budgeted: number; // budgeted this month
  activity: number; // outflows/inflows this month (negative = spent)
  available: number; // month-end balance, carried forward
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

  return { budgeted, activity: credit + cash, balance, cashOverspend };
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
  // No activity at all, or the target predates the budget — nothing has happened.
  if (allMonths.length === 0 || targetIdx < startIdx) {
    return { summary: zeroSummary(targetMonth), categories: new Map() };
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
        categories.set(catId, { budgeted: 0, activity: 0, available: bal / 100 });
      }
      for (const catId of touched) {
        const r = rollCategory(balances.get(catId) ?? 0, budM?.get(catId), actM?.get(catId));
        categories.set(catId, {
          budgeted: r.budgeted / 100,
          activity: r.activity / 100,
          available: r.balance / 100,
        });
      }
      return {
        summary: {
          month: targetMonth,
          notBudgeted: prevAvailable / 100,
          overspentPrev: prevCashOverspent / 100,
          income: inc / 100,
          budgeted: bud / 100,
          availableToBudget: available / 100,
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

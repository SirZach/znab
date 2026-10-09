import { z } from "zod";
import { sql, eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { budgets, accounts, transactions } from "@znab/db";
import { assertBudgetAccess } from "../lib/authz";
import { IS_INCOME, onBudgetMoneySource } from "../lib/money-source";
import {
  fromCents,
  REPORT_TIMEFRAMES,
  type ReportTimeframe,
  roundMoney,
  toCents,
} from "@znab/shared";

type NetWorthPoint = {
  month: string; // "YYYY-MM"
  assets: number;
  debts: number;
  netWorth: number;
};

type CategorySpend = {
  categoryId: number;
  category: string;
  group: string;
  spent: number;
};

type PayeeSpend = {
  payeeId: number;
  payee: string;
  spent: number;
};

type IncomeVsExpensePoint = {
  month: string;
  income: number;
  expense: number;
  net: number;
};

export const reportRouter = router({
  // Who a budget paid, over a timeframe.
  //
  // The same money as Spending by Category, asked the other way round, so the
  // two totals agree by construction. A split's parts carry no payee of their
  // own, so they are attributed to the payee on the row the register shows,
  // which is the one the money was actually paid to.
  spendingByPayee: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        timeframe: z.enum(REPORT_TIMEFRAMES).default("last12"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      const cutoff = timeframeCutoff(input.timeframe);
      const since = cutoff ? `${cutoff}-01` : null;

      const rows = (await ctx.db.execute(sql`
        WITH spend AS (
          SELECT payee_id, category_id, amount
          FROM (${onBudgetMoneySource(input.budgetId, { since })}) m
          WHERE category_id IS NOT NULL AND payee_id IS NOT NULL
        )
        SELECT p.id AS "payeeId",
               p.name AS "payee",
               SUM(spend.amount) AS "net"
        FROM spend
        JOIN payees p ON p.id = spend.payee_id
        JOIN categories c ON c.id = spend.category_id
        JOIN category_groups g ON g.id = c.group_id
        WHERE g.type <> 'INFLOW'
        GROUP BY p.id, p.name
        HAVING SUM(spend.amount) < 0
        ORDER BY SUM(spend.amount) ASC
      `)) as unknown as { payeeId: number; payee: string; net: string }[];

      const spending: PayeeSpend[] = rows.map((row) => ({
        payeeId: row.payeeId,
        payee: row.payee,
        spent: fromCents(-toCents(row.net)),
      }));

      return {
        spending,
        total: roundMoney(spending.reduce((sum, row) => sum + row.spent, 0)),
      };
    }),

  // What came in against what went out, by month.
  //
  // Both sides are budget money only. A tracking account's interest is a gain
  // in net worth rather than income to spend, and thirteen such rows here are
  // worth 153,696.27, which would have swamped every real month.
  incomeVsExpense: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        timeframe: z.enum(REPORT_TIMEFRAMES).default("last12"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      const cutoff = timeframeCutoff(input.timeframe);
      const since = cutoff ? `${cutoff}-01` : null;

      const rows = (await ctx.db.execute(sql`
        WITH moved AS (
          SELECT d AS date, amount, category_ynab_id, category_id
          FROM (${onBudgetMoneySource(input.budgetId, { since })}) m
        )
        SELECT to_char(date_trunc('month', moved.date), 'YYYY-MM') AS "month",
               COALESCE(SUM(moved.amount) FILTER (WHERE ${IS_INCOME}), 0) AS "income",
               COALESCE(SUM(moved.amount) FILTER (
                 WHERE moved.category_id IS NOT NULL
               ), 0) AS "categorised"
        FROM moved
        GROUP BY date_trunc('month', moved.date)
        ORDER BY date_trunc('month', moved.date)
      `)) as unknown as { month: string; income: string; categorised: string }[];

      // A split parent counts on neither side: it carries no category of its
      // own, and its parts are already in the union above.
      const series: IncomeVsExpensePoint[] = rows.map((row) => {
        const income = roundMoney(row.income);
        // Categorised money nets out to a negative in any month that spent
        // more than it was refunded, and that net is the expense.
        const expense = fromCents(-toCents(row.categorised));
        return {
          month: row.month,
          income,
          expense,
          net: roundMoney(income - expense),
        };
      });

      const totals = series.reduce(
        (acc, point) => ({
          income: acc.income + point.income,
          expense: acc.expense + point.expense,
        }),
        { income: 0, expense: 0 }
      );

      return {
        series,
        summary: {
          income: roundMoney(totals.income),
          expense: roundMoney(totals.expense),
          net: roundMoney(totals.income - totals.expense),
        },
      };
    }),

  // What a budget was spent on, by category, over a timeframe.
  //
  // Spending is the net of a category rather than the sum of its outflows, so
  // a refund reduces what the category cost rather than being dropped, which
  // is what makes the figures here agree with the register. Categories that
  // come out net positive over the window are left out: they were not spent.
  spendingByCategory: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        timeframe: z.enum(REPORT_TIMEFRAMES).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      const cutoff = timeframeCutoff(input.timeframe);
      const since = cutoff ? `${cutoff}-01` : null;

      // Two sources, because a split files its money on its parts and leaves
      // the row the register shows uncategorised. Income needs no excluding:
      // it carries no category of its own, only a ynab id, so it never joins.
      //
      // Only budget accounts count. A tracking account's money was never
      // budgeted, so spending it is not spending the budget: eleven such rows
      // here are inflows filed against a real category, and counting them made
      // that category look 5,668.73 cheaper than it was.
      const rows = (await ctx.db.execute(sql`
        WITH spend AS (
          SELECT category_id, amount
          FROM (${onBudgetMoneySource(input.budgetId, { since })}) m
          WHERE category_id IS NOT NULL
        )
        SELECT c.id AS "categoryId",
               c.name AS "category",
               g.name AS "group",
               SUM(spend.amount) AS "net"
        FROM spend
        JOIN categories c ON c.id = spend.category_id
        JOIN category_groups g ON g.id = c.group_id
        WHERE g.type <> 'INFLOW'
        GROUP BY c.id, c.name, g.name
        HAVING SUM(spend.amount) < 0
        ORDER BY SUM(spend.amount) ASC
      `)) as unknown as {
        categoryId: number;
        category: string;
        group: string;
        net: string;
      }[];

      const spending: CategorySpend[] = rows.map((row) => ({
        categoryId: row.categoryId,
        category: row.category,
        group: row.group,
        spent: fromCents(-toCents(row.net)),
      }));

      return {
        spending,
        total: roundMoney(spending.reduce((sum, row) => sum + row.spent, 0)),
      };
    }),

  // Monthly net-worth time series across all accounts in a budget.
  // Each account's month-end balance is an asset if positive, a debt if
  // negative (YNAB's sign-based split). Net worth = assets - debts.
  netWorth: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        timeframe: z.enum(REPORT_TIMEFRAMES).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify budget belongs to user
      const budget = await ctx.db.query.budgets.findFirst({
        where: and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id)),
      });
      if (!budget) throw new TRPCError({ code: "NOT_FOUND", message: "Budget not found" });

      // Sum of transaction amounts per account per month. Only at most
      // (#accounts * #months) rows come back, so no need to pull raw rows.
      const rows = await ctx.db
        .select({
          accountId: transactions.accountId,
          month: sql<string>`to_char(date_trunc('month', ${transactions.date}), 'YYYY-MM')`,
          delta: sql<string>`sum(${transactions.amount})`,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .where(
          and(
            eq(transactions.budgetId, input.budgetId),
            isNull(transactions.deletedAt),
            isNull(accounts.deletedAt)
          )
        )
        .groupBy(transactions.accountId, sql`date_trunc('month', ${transactions.date})`);

      if (rows.length === 0) {
        return { series: [] as NetWorthPoint[], summary: null };
      }

      // Group deltas (in integer cents) by month, keyed by account.
      const deltasByMonth = new Map<string, Map<number, number>>();
      let minMonth = rows[0]!.month;
      let maxMonth = rows[0]!.month;
      for (const row of rows) {
        const cents = toCents(row.delta);
        let monthMap = deltasByMonth.get(row.month);
        if (!monthMap) {
          monthMap = new Map();
          deltasByMonth.set(row.month, monthMap);
        }
        monthMap.set(row.accountId, cents);
        if (row.month < minMonth) minMonth = row.month;
        if (row.month > maxMonth) maxMonth = row.month;
      }

      // Walk the inclusive month axis, carrying each account's balance
      // forward, and aggregate assets/debts/net worth per month.
      const balances = new Map<number, number>(); // accountId -> cents
      const series: NetWorthPoint[] = [];
      for (const month of monthRange(minMonth, maxMonth)) {
        const monthDeltas = deltasByMonth.get(month);
        if (monthDeltas) {
          for (const [accountId, cents] of monthDeltas) {
            balances.set(accountId, (balances.get(accountId) ?? 0) + cents);
          }
        }

        let assets = 0;
        let debts = 0;
        for (const bal of balances.values()) {
          if (bal > 0) assets += bal;
          else if (bal < 0) debts += -bal;
        }

        series.push({
          month,
          assets: fromCents(assets),
          debts: fromCents(debts),
          netWorth: fromCents(assets - debts),
        });
      }

      // Apply the timeframe window last so balances stay cumulative.
      const cutoff = timeframeCutoff(input.timeframe);
      const filtered = cutoff ? series.filter((p) => p.month >= cutoff) : series;

      return {
        series: filtered,
        summary: filtered.length > 0 ? filtered[filtered.length - 1]! : null,
      };
    }),
});

/** Inclusive list of "YYYY-MM" months from start to end. */
function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let [year, month] = start.split("-").map(Number) as [number, number];
  const [endYear, endMonth] = end.split("-").map(Number) as [number, number];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** First "YYYY-MM" month to include for a timeframe, or null for all dates. */
function timeframeCutoff(timeframe: ReportTimeframe): string | null {
  if (timeframe === "all") return null;
  const now = new Date();
  const year = now.getFullYear();
  if (timeframe === "thisYear") return `${year}-01`;
  const monthsBack = timeframe === "last12" ? 11 : 47;
  const cutoff = new Date(year, now.getMonth() - monthsBack, 1);
  return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
}

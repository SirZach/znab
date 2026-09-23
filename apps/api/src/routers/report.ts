import { z } from "zod";
import { sql, eq, and, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { budgets, accounts, transactions } from "@znab/db";
import { assertBudgetAccess } from "../lib/authz";

const TIMEFRAMES = ["all", "thisYear", "last12", "last4Years"] as const;

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

export const reportRouter = router({
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
        timeframe: z.enum(TIMEFRAMES).default("all"),
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
          SELECT t.category_id, t.amount
          FROM transactions t
          JOIN accounts a ON a.id = t.account_id
          WHERE t.budget_id = ${input.budgetId}
            AND t.deleted_at IS NULL
            AND t.is_transfer = false
            AND t.category_id IS NOT NULL
            AND a.on_budget = true
            AND a.deleted_at IS NULL
            ${since ? sql`AND t.date >= ${since}::date` : sql``}
          UNION ALL
          SELECT s.category_id, s.amount
          FROM sub_transactions s
          JOIN transactions t ON t.id = s.transaction_id
          JOIN accounts a ON a.id = t.account_id
          WHERE t.budget_id = ${input.budgetId}
            AND t.deleted_at IS NULL
            AND s.deleted_at IS NULL
            AND t.is_transfer = false
            AND s.category_id IS NOT NULL
            AND a.on_budget = true
            AND a.deleted_at IS NULL
            ${since ? sql`AND t.date >= ${since}::date` : sql``}
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
        spent: Math.round(-parseFloat(row.net) * 100) / 100,
      }));

      return {
        spending,
        total: Math.round(spending.reduce((sum, row) => sum + row.spent, 0) * 100) / 100,
      };
    }),

  // Monthly net-worth time series across all accounts in a budget.
  // Each account's month-end balance is an asset if positive, a debt if
  // negative (YNAB's sign-based split). Net worth = assets - debts.
  netWorth: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        timeframe: z.enum(TIMEFRAMES).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify budget belongs to user
      const budget = await ctx.db.query.budgets.findFirst({
        where: and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id)),
      });
      if (!budget) throw new Error("Budget not found");

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
        const cents = Math.round(parseFloat(row.delta) * 100);
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
          assets: assets / 100,
          debts: debts / 100,
          netWorth: (assets - debts) / 100,
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
function timeframeCutoff(timeframe: (typeof TIMEFRAMES)[number]): string | null {
  if (timeframe === "all") return null;
  const now = new Date();
  const year = now.getFullYear();
  if (timeframe === "thisYear") return `${year}-01`;
  const monthsBack = timeframe === "last12" ? 11 : 47;
  const cutoff = new Date(year, now.getMonth() - monthsBack, 1);
  return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
}

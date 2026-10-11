import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, inArray, isNull, type SQL } from "drizzle-orm";
import type { Context } from "../context";
import { router, budgetProcedure } from "../trpc";
import { accounts, transactions } from "@znab/db";
import { assertFilterIdsInBudget } from "../lib/authz";
import { comparisonPeriods } from "../lib/comparison-periods";
import { dailyWindow } from "../lib/daily-window";
import { isoDateSchema } from "../lib/input";
import { localToday } from "../lib/date";
import { andIdsIn, IS_INCOME, onBudgetMoneySource } from "../lib/money-source";
import {
  COMPARISON_ANCHOR,
  COMPARISON_PERIODS,
  fromCents,
  REPORT_TIMEFRAMES,
  type ReportTimeframe,
  roundMoney,
  toCents,
} from "@znab/shared";

/**
 * The accounts and categories a report is narrowed to. Leaving one out means
 * all of them; an empty list is refused rather than read as "none", which no
 * screen would ask for.
 */
const idList = z.array(z.number().int().positive()).min(1).max(1000).optional();
const filterFields = { accountIds: idList, categoryIds: idList };
type ReportFilter = { accountIds?: number[]; categoryIds?: number[] };

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
  spendingByPayee: budgetProcedure
    .input(
      z.object({
        timeframe: z.enum(REPORT_TIMEFRAMES).default("last12"),
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
      const cutoff = timeframeCutoff(input.timeframe);
      const since = cutoff ? `${cutoff}-01` : null;

      const rows = (await ctx.db.execute(sql`
        WITH spend AS (
          SELECT payee_id, category_id, amount
          FROM (${onBudgetMoneySource(input.budgetId, { since, accountIds: input.accountIds })}) m
          WHERE category_id IS NOT NULL AND payee_id IS NOT NULL
        )
        SELECT p.id AS "payeeId",
               p.name AS "payee",
               SUM(spend.amount) AS "net"
        FROM spend
        JOIN payees p ON p.id = spend.payee_id
        JOIN categories c ON c.id = spend.category_id
        JOIN category_groups g ON g.id = c.group_id
        WHERE g.type <> 'INFLOW' ${andIdsIn(sql`c.id`, input.categoryIds)}
        GROUP BY p.id, p.name
        HAVING SUM(spend.amount) < 0
        ORDER BY SUM(spend.amount) ASC, p.name, p.id
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
  incomeVsExpense: budgetProcedure
    .input(
      z.object({
        timeframe: z.enum(REPORT_TIMEFRAMES).default("last12"),
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
      const cutoff = timeframeCutoff(input.timeframe);
      const since = cutoff ? `${cutoff}-01` : null;

      // A category filter narrows the expense side only: income is not a
      // category row, so there is nothing of it to choose.
      const rows = (await ctx.db.execute(sql`
        WITH moved AS (
          SELECT d AS date, amount, category_ynab_id, category_id
          FROM (${onBudgetMoneySource(input.budgetId, { since, accountIds: input.accountIds })}) m
        )
        SELECT to_char(date_trunc('month', moved.date), 'YYYY-MM') AS "month",
               COALESCE(SUM(moved.amount) FILTER (WHERE ${IS_INCOME}), 0) AS "income",
               COALESCE(SUM(moved.amount) FILTER (
                 WHERE moved.category_id IS NOT NULL ${andIdsIn(sql`moved.category_id`, input.categoryIds)}
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
  spendingByCategory: budgetProcedure
    .input(
      z.object({
        timeframe: z.enum(REPORT_TIMEFRAMES).default("all"),
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
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
          FROM (${onBudgetMoneySource(input.budgetId, { since, accountIds: input.accountIds })}) m
          WHERE category_id IS NOT NULL
        )
        SELECT c.id AS "categoryId",
               c.name AS "category",
               g.name AS "group",
               SUM(spend.amount) AS "net"
        FROM spend
        JOIN categories c ON c.id = spend.category_id
        JOIN category_groups g ON g.id = c.group_id
        WHERE g.type <> 'INFLOW' ${andIdsIn(sql`c.id`, input.categoryIds)}
        GROUP BY c.id, c.name, g.name
        HAVING SUM(spend.amount) < 0
        ORDER BY SUM(spend.amount) ASC, c.name, c.id
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

  // What a typical month costs, by category, over a timeframe.
  //
  // Only complete months count: this month is still running, so including it
  // would drag every average down by however much of the month is left. Last
  // 12 Months is therefore the twelve months before this one. Nor do months
  // before the budget had any money in it: a budget a year old is averaged
  // over its year, not over the four the timeframe names. That first month is
  // the budget's whatever the filters, since a filter narrows what is counted
  // rather than how long it is spread over, so a category reads the same
  // average however it is filtered. Each category's figure is its net, as in
  // Spending by Category, and one that comes out net positive over the window
  // was not spent and is left out.
  averageSpending: budgetProcedure
    .input(
      z.object({
        timeframe: z.enum(REPORT_TIMEFRAMES).default("last12"),
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
      const end = monthOf(new Date());
      const start = completeMonthsStart(input.timeframe, end);
      const [{ budgetFirst }] = (await ctx.db.execute(sql`
        SELECT to_char(MIN(m.d), 'YYYY-MM') AS "budgetFirst"
        FROM (${onBudgetMoneySource(input.budgetId)}) m
        WHERE m.d < ${`${end}-01`}::date
      `)) as unknown as [{ budgetFirst: string | null }];

      const rows = (await ctx.db.execute(sql`
        SELECT c.id AS "categoryId",
               c.name AS "category",
               g.name AS "group",
               SUM(m.amount) AS "net"
        FROM (${onBudgetMoneySource(input.budgetId, {
          since: start ? `${start}-01` : null,
          accountIds: input.accountIds,
        })}) m
        JOIN categories c ON c.id = m.category_id
        JOIN category_groups g ON g.id = c.group_id
        WHERE g.type <> 'INFLOW' AND m.d < ${`${end}-01`}::date
          ${andIdsIn(sql`c.id`, input.categoryIds)}
        GROUP BY c.id, c.name, g.name
      `)) as unknown as {
        categoryId: number;
        category: string;
        group: string;
        net: string;
      }[];

      const first = budgetFirst && start && start > budgetFirst ? start : budgetFirst;
      const months = first ? monthRange(first, end).length - 1 : 0;
      // Each figure is rounded on its own, so the rows can sum a cent or two
      // away from the headline, as Spending by Category's do.
      const perMonth = (cents: number) => (months > 0 ? fromCents(Math.round(cents / months)) : 0);

      const spent = rows
        .map((row) => ({ ...row, cents: -toCents(row.net) }))
        .filter((row) => row.cents > 0)
        .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category) || a.categoryId - b.categoryId);
      const totalCents = spent.reduce((sum, row) => sum + row.cents, 0);

      return {
        months,
        firstMonth: months > 0 ? first : null,
        spending: spent.map((row) => ({
          categoryId: row.categoryId,
          category: row.category,
          group: row.group,
          total: fromCents(row.cents),
          average: perMonth(row.cents),
        })),
        total: fromCents(totalCents),
        average: perMonth(totalCents),
      };
    }),

  // A month or a year against the one before it, by category.
  //
  // Each side is a category's net, as in Spending by Category, so a side can
  // read negative where refunds outweighed spending. A period still running
  // is compared to date (see comparisonPeriods). Categories with nothing on
  // either side are left out.
  spendingComparison: budgetProcedure
    .input(
      z
        .object({
          period: z.enum(COMPARISON_PERIODS).default("month"),
          // "YYYY-MM" for a month, "YYYY" for a year; this one when left out.
          anchor: z.string().regex(COMPARISON_ANCHOR).optional(),
          ...filterFields,
        })
        .superRefine((value, issues) => {
          if (value.anchor && value.anchor.length !== (value.period === "month" ? 7 : 4)) {
            issues.addIssue({ code: "custom", path: ["anchor"], message: "Anchor does not match the period" });
          }
        })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
      const today = localToday();
      const thisPeriod = input.period === "month" ? today.slice(0, 7) : today.slice(0, 4);
      // A period that has not begun has nothing to compare, so it is read as
      // this one, which is also what a browser a day ahead of the server asks.
      const anchor = input.anchor && input.anchor < thisPeriod ? input.anchor : thisPeriod;
      const { toDate, current, previous } = comparisonPeriods(input.period, anchor, today);
      const inRange = (range: { start: string; end: string }) =>
        sql`m.d >= ${range.start}::date AND m.d < ${range.end}::date`;

      const rows = (await ctx.db.execute(sql`
        SELECT c.id AS "categoryId",
               c.name AS "category",
               g.name AS "group",
               COALESCE(SUM(m.amount) FILTER (WHERE ${inRange(current)}), 0) AS "current",
               COALESCE(SUM(m.amount) FILTER (WHERE ${inRange(previous)}), 0) AS "previous"
        FROM (${onBudgetMoneySource(input.budgetId, { since: previous.start, accountIds: input.accountIds })}) m
        JOIN categories c ON c.id = m.category_id
        JOIN category_groups g ON g.id = c.group_id
        WHERE g.type <> 'INFLOW' AND m.d < ${current.end}::date
          ${andIdsIn(sql`c.id`, input.categoryIds)}
        GROUP BY c.id, c.name, g.name
      `)) as unknown as {
        categoryId: number;
        category: string;
        group: string;
        current: string;
        previous: string;
      }[];

      const compared = rows
        .map((row) => ({
          categoryId: row.categoryId,
          category: row.category,
          group: row.group,
          currentCents: -toCents(row.current),
          previousCents: -toCents(row.previous),
        }))
        .filter((row) => row.currentCents !== 0 || row.previousCents !== 0)
        .sort(
          (a, b) =>
            b.currentCents - a.currentCents ||
            b.previousCents - a.previousCents ||
            a.category.localeCompare(b.category) ||
            a.categoryId - b.categoryId
        );
      const sum = (key: "currentCents" | "previousCents") =>
        compared.reduce((total, row) => total + row[key], 0);

      return {
        period: input.period,
        anchor,
        toDate,
        current,
        previous,
        rows: compared.map((row) => ({
          categoryId: row.categoryId,
          category: row.category,
          group: row.group,
          current: fromCents(row.currentCents),
          previous: fromCents(row.previousCents),
          change: fromCents(row.currentCents - row.previousCents),
        })),
        totals: {
          current: fromCents(sum("currentCents")),
          previous: fromCents(sum("previousCents")),
          change: fromCents(sum("currentCents") - sum("previousCents")),
        },
      };
    }),

  // A year of spending, day by day, for a calendar.
  //
  // Each day is the net of what was spent on it, on the same terms as
  // Spending by Category, so a day of nothing but a refund reads negative.
  // Only days with something on them are listed; the rest of the year is
  // zero. The year still running is counted through today and no further
  // (see dailyWindow), and `through` says which day that was, so the page
  // draws exactly the days the totals cover rather than working out its own.
  dailySpending: budgetProcedure
    .input(
      z.object({
        year: z.number().int().min(1900).max(2099),
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
      const { year, start, until, through, days: daysInYear } = dailyWindow(input.year, localToday());

      const rows = (await ctx.db.execute(sql`
        SELECT to_char(m.d, 'YYYY-MM-DD') AS "date", SUM(m.amount) AS "net"
        FROM (${onBudgetMoneySource(input.budgetId, { since: start, accountIds: input.accountIds })}) m
        JOIN categories c ON c.id = m.category_id
        JOIN category_groups g ON g.id = c.group_id
        WHERE g.type <> 'INFLOW' AND m.d < ${until}::date
          ${andIdsIn(sql`c.id`, input.categoryIds)}
        GROUP BY m.d
        HAVING SUM(m.amount) <> 0
        ORDER BY m.d
      `)) as unknown as { date: string; net: string }[];

      const days = rows.map((row) => ({ date: row.date, spent: fromCents(-toCents(row.net)) }));
      const biggest = days.reduce<(typeof days)[number] | null>(
        (top, day) => (day.spent > 0 && (!top || day.spent > top.spent) ? day : top),
        null
      );

      return {
        year,
        through,
        days,
        total: fromCents(days.reduce((sum, day) => sum + toCents(day.spent), 0)),
        daysInYear,
        spendingDays: days.filter((day) => day.spent > 0).length,
        biggest,
      };
    }),

  // What made up one day of the spending calendar: every transaction, and
  // every split part, on the terms dailySpending counts, so their total is the
  // day's figure. Largest first; a refund shows as negative spending.
  dayTransactions: budgetProcedure
    .input(
      z.object({
        date: isoDateSchema,
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);

      const rows = (await ctx.db.execute(sql`
        SELECT m.transaction_id AS "transactionId",
               m.sub_transaction_id AS "subTransactionId",
               m.account_id AS "accountId",
               a.name AS "accountName",
               p.name AS "payeeName",
               c.name AS "category",
               m.memo,
               m.amount
        FROM (${onBudgetMoneySource(input.budgetId, { since: input.date, accountIds: input.accountIds })}) m
        JOIN categories c ON c.id = m.category_id
        JOIN category_groups g ON g.id = c.group_id
        JOIN accounts a ON a.id = m.account_id
        LEFT JOIN payees p ON p.id = m.payee_id
        WHERE g.type <> 'INFLOW' AND m.d = ${input.date}::date
          ${andIdsIn(sql`c.id`, input.categoryIds)}
        ORDER BY m.amount ASC, m.transaction_id, m.sub_transaction_id
      `)) as unknown as {
        transactionId: number;
        subTransactionId: number | null;
        accountId: number;
        accountName: string;
        payeeName: string | null;
        category: string;
        memo: string | null;
        amount: string;
      }[];

      const transactions = rows.map(({ amount, ...row }) => ({ ...row, spent: fromCents(-toCents(amount)) }));
      return {
        date: input.date,
        transactions,
        total: fromCents(transactions.reduce((sum, t) => sum + toCents(t.spent), 0)),
      };
    }),

  // One category from Spending by Category, by month, over the same timeframe.
  //
  // Each month is the category's net, as above, so a month whose refunds
  // outweighed its spending reads negative rather than vanishing, and the
  // months sum to the figure Spending by Category shows for it. Months with
  // nothing in them are filled with zero so the chart keeps its time axis.
  categorySpending: budgetProcedure
    .input(
      z.object({
        categoryId: z.number().int(),
        timeframe: z.enum(REPORT_TIMEFRAMES).default("all"),
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
      const [category] = (await ctx.db.execute(sql`
        SELECT c.name AS "category", g.name AS "group"
        FROM categories c
        JOIN category_groups g ON g.id = c.group_id
        WHERE c.id = ${input.categoryId} AND c.budget_id = ${input.budgetId}
      `)) as unknown as { category: string; group: string }[];
      if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

      return {
        ...category,
        ...(await monthlySpend(ctx.db, input.budgetId, input.timeframe, input, sql`m.category_id = ${input.categoryId}`)),
      };
    }),

  // One payee from Spending by Payee, by month, over the same timeframe, on
  // the same terms as categorySpending.
  payeeSpending: budgetProcedure
    .input(
      z.object({
        payeeId: z.number().int(),
        timeframe: z.enum(REPORT_TIMEFRAMES).default("all"),
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
      const [payee] = (await ctx.db.execute(sql`
        SELECT name AS "payee" FROM payees
        WHERE id = ${input.payeeId} AND budget_id = ${input.budgetId}
      `)) as unknown as { payee: string }[];
      if (!payee) throw new TRPCError({ code: "NOT_FOUND", message: "Payee not found" });

      return {
        ...payee,
        ...(await monthlySpend(ctx.db, input.budgetId, input.timeframe, input, sql`m.payee_id = ${input.payeeId}`)),
      };
    }),

  // Monthly net-worth time series across all accounts in a budget.
  // Each account's month-end balance is an asset if positive, a debt if
  // negative (YNAB's sign-based split). Net worth = assets - debts.
  netWorth: budgetProcedure
    .input(
      z.object({
        timeframe: z.enum(REPORT_TIMEFRAMES).default("all"),
        ...filterFields,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertFilterIdsInBudget(ctx.db, input.budgetId, input);
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
            isNull(accounts.deletedAt),
            input.accountIds ? inArray(transactions.accountId, input.accountIds) : undefined
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

/**
 * The spending `filter` picks out of a budget, as its net per month over a
 * timeframe, on the terms the Spending by Category and by Payee reports count
 * it: categorised money outside income groups. A month whose refunds
 * outweighed its spending reads negative rather than vanishing, so the months
 * sum to the figure the report lists, and months with nothing in them are
 * filled with zero so a chart keeps its time axis.
 */
async function monthlySpend(
  db: Context["db"],
  budgetId: number,
  timeframe: ReportTimeframe,
  { accountIds, categoryIds }: ReportFilter,
  filter: SQL
) {
  const cutoff = timeframeCutoff(timeframe);
  const since = cutoff ? `${cutoff}-01` : null;

  const rows = (await db.execute(sql`
    SELECT to_char(date_trunc('month', m.d), 'YYYY-MM') AS "month",
           SUM(m.amount) AS "net"
    FROM (${onBudgetMoneySource(budgetId, { since, accountIds })}) m
    JOIN categories c ON c.id = m.category_id
    JOIN category_groups g ON g.id = c.group_id
    WHERE g.type <> 'INFLOW' AND ${filter} ${andIdsIn(sql`c.id`, categoryIds)}
    GROUP BY date_trunc('month', m.d)
    ORDER BY date_trunc('month', m.d)
  `)) as unknown as { month: string; net: string }[];

  const netByMonth = new Map(rows.map((row) => [row.month, toCents(row.net)]));
  const thisMonth = monthOf(new Date());
  const first = cutoff ?? rows[0]?.month;
  const last = rows.at(-1)?.month;
  const series = first
    ? monthRange(first, last && last > thisMonth ? last : thisMonth).map((month) => ({
        month,
        spent: fromCents(-(netByMonth.get(month) ?? 0)),
      }))
    : [];

  return {
    series,
    total: fromCents(-rows.reduce((sum, row) => sum + toCents(row.net), 0)),
  };
}

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
  return monthOf(new Date(year, now.getMonth() - monthsBack, 1));
}

/**
 * The first complete month a timeframe covers, counting back from `end`, the
 * month still running, which is left out. Null for all dates.
 */
function completeMonthsStart(timeframe: ReportTimeframe, end: string): string | null {
  if (timeframe === "all") return null;
  const [year, month] = end.split("-").map(Number) as [number, number];
  if (timeframe === "thisYear") return `${year}-01`;
  const back = timeframe === "last12" ? 12 : 48;
  return monthOf(new Date(year, month - 1 - back, 1));
}

/** The local "YYYY-MM" month a date falls in. */
function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { budgets, monthlyBudgets, categories } from "@znab/db";
import { setBudgetedSchema } from "@znab/shared";
import { assertBudgetAccess } from "../lib/authz";
import {
  computeBudgetMonth,
  IMMEDIATE_INCOME,
  DEFERRED_INCOME,
  type ActivityRow,
  type IncomeRow,
  type BudgetedRow,
} from "../lib/budget-math";

// Re-exported so the web client keeps importing these from the router it calls.
export type { MonthSummary, CategoryMonth, OverspendKind } from "../lib/budget-math";

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
      await assertBudgetAccess(ctx, input.budgetId);

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
      await assertBudgetAccess(ctx, input.budgetId);

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
              overspendKind: cm?.overspendKind ?? null,
            };
          }),
        })),
      };
    }),

  // Set the budgeted amount for a category in a month
  setBudgeted: protectedProcedure
    .input(setBudgetedSchema.extend({ budgetId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      // The upsert below conflicts on (category_id, month), so the category has
      // to be checked as well as the budget: a category id from someone else's
      // budget would resolve to their allocation row and overwrite it.
      const category = await ctx.db.query.categories.findFirst({
        where: and(
          eq(categories.id, input.categoryId),
          eq(categories.budgetId, input.budgetId)
        ),
      });
      if (!category) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
      }

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

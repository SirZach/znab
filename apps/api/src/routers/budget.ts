import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { budgets, monthlyBudgets, categories } from "@znab/db";
import { setBudgetedSchema } from "@znab/shared";
import { assertBudgetAccess, type AuthedContext } from "../lib/authz";
import {
  computeBudgetMonth,
  computeQuickBudget,
  computeCategoryGoal,
  monthIndex,
  monthFromIndex,
  IMMEDIATE_INCOME,
  DEFERRED_INCOME,
  type ActivityRow,
  type IncomeRow,
  type BudgetedRow,
  type GoalType,
  type CategoryGoal,
} from "../lib/budget-math";

// Re-exported so the web client keeps importing these from the router it calls.
export type { MonthSummary, CategoryMonth, OverspendKind, GoalType, CategoryGoal } from "../lib/budget-math";

/**
 * Throws unless the category belongs to the budget. Allocation rows are keyed
 * by (category, month), so a category id from elsewhere would resolve to
 * another budget's row, so checking the budget alone is not enough.
 */
async function assertCategoryInBudget(
  ctx: AuthedContext,
  categoryId: number,
  budgetId: number
) {
  const category = await ctx.db.query.categories.findFirst({
    where: and(eq(categories.id, categoryId), eq(categories.budgetId, budgetId)),
  });
  if (!category) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
  }
  return category;
}

/**
 * The three raw series the month engine runs on, for a whole budget's history.
 * Shared by every procedure that has to reason about a month, so they cannot
 * drift apart.
 */
export function loadBudgetInputs(db: AuthedContext["db"], budgetId: number) {
  // Outflows on a credit card or other on-budget liability become debt, so
  // they are classified separately from cash for overspending purposes.
  const klass = sql`CASE WHEN a.account_type IN ('CreditCard', 'OtherLiability') THEN 'credit' ELSE 'cash' END`;

  return Promise.all([
    // Category spending/refunds per month, split by funding source. Only
    // on-budget accounts affect the budget. Splits contribute via their
    // sub-transactions, not the parent.
    db.execute(sql`
      SELECT
        category_id AS "categoryId",
        to_char(date_trunc('month', d), 'YYYY-MM') AS month,
        COALESCE(sum(amount) FILTER (WHERE klass = 'credit'), 0) AS credit,
        COALESCE(sum(amount) FILTER (WHERE klass = 'cash'), 0)   AS cash
      FROM (
        SELECT t.category_id, t.date AS d, t.amount, ${klass} AS klass
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.budget_id = ${budgetId}
          AND t.deleted_at IS NULL AND a.deleted_at IS NULL
          AND a.on_budget = true AND t.is_split = false
          AND t.category_id IS NOT NULL
        UNION ALL
        SELECT s.category_id, t.date AS d, s.amount, ${klass} AS klass
        FROM sub_transactions s
        JOIN transactions t ON t.id = s.transaction_id
        JOIN accounts a ON a.id = t.account_id
        WHERE t.budget_id = ${budgetId}
          AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND a.deleted_at IS NULL
          AND a.on_budget = true AND s.category_id IS NOT NULL
      ) x
      GROUP BY category_id, date_trunc('month', d)
    `) as unknown as Promise<ActivityRow[]>,
    // Money entering "To be Budgeted". Immediate income lands in its own
    // month; deferred income is held for the following month.
    db.execute(sql`
      SELECT
        to_char(date_trunc('month', d), 'YYYY-MM') AS month,
        kind,
        sum(amount) AS amount
      FROM (
        SELECT t.date AS d, t.category_ynab_id AS kind, t.amount
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.budget_id = ${budgetId}
          AND t.deleted_at IS NULL AND a.deleted_at IS NULL AND a.on_budget = true
          AND t.is_split = false
          AND t.category_ynab_id IN (${IMMEDIATE_INCOME}, ${DEFERRED_INCOME})
        UNION ALL
        SELECT t.date AS d, s.category_ynab_id AS kind, s.amount
        FROM sub_transactions s
        JOIN transactions t ON t.id = s.transaction_id
        JOIN accounts a ON a.id = t.account_id
        WHERE t.budget_id = ${budgetId}
          AND t.deleted_at IS NULL AND s.deleted_at IS NULL AND a.deleted_at IS NULL
          AND a.on_budget = true
          AND s.category_ynab_id IN (${IMMEDIATE_INCOME}, ${DEFERRED_INCOME})
      ) x
      GROUP BY date_trunc('month', d), kind
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
      // All reads are independent, so issue them together.
      const [budget, groups, [activity, income, budgetedRows], hiddenRows] =
        await Promise.all([
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
        loadBudgetInputs(ctx.db, input.budgetId),
        // Hidden categories, returned alongside the groups rather than inside
        // them. They keep their history and balances but must not count towards
        // any group's subtotal, which is what the grid shows on the header row.
        ctx.db.query.categories.findMany({
          where: (c, { eq, and, isNotNull }) =>
            and(eq(c.budgetId, input.budgetId), isNotNull(c.deletedAt)),
          orderBy: (c, { asc }) => [asc(c.name)],
          with: { group: { columns: { name: true } } },
        }),
      ]);
      if (!budget) throw new Error("Budget not found");

      const currentMonth = input.month.slice(0, 7);
      const { summary, categories } = computeBudgetMonth({
        activity,
        income,
        budgeted: budgetedRows,
        targetMonth: currentMonth,
      });

      return {
        summary,
        groups: groups.map((group) => ({
          ...group,
          categories: group.categories.map((cat) => {
            const cm = categories.get(cat.id);
            const budgeted = cm?.budgeted ?? 0;
            const available = cm?.available ?? 0;
            const goal: CategoryGoal | null = cat.goalType
              ? computeCategoryGoal({
                  type: cat.goalType as GoalType,
                  target: parseFloat(cat.goalTarget ?? "0"),
                  targetMonth: cat.goalTargetMonth ? cat.goalTargetMonth.slice(0, 7) : null,
                  budgeted,
                  available,
                  currentMonth,
                })
              : null;
            return {
              ...cat,
              budgeted,
              activity: cm?.activity ?? 0,
              available,
              overspendKind: cm?.overspendKind ?? null,
              confined: cm?.confined ?? false,
              goal,
            };
          }),
        })),
        hidden: hiddenRows.map((cat) => {
          const cm = categories.get(cat.id);
          return {
            id: cat.id,
            name: cat.name,
            groupName: cat.group?.name ?? "",
            budgeted: cm?.budgeted ?? 0,
            activity: cm?.activity ?? 0,
            available: cm?.available ?? 0,
          };
        }),
      };
    }),

  // Hide a category or bring it back. YNAB 4 never truly deletes a category
  // because its history is part of past months, so hiding is a soft delete and
  // unhiding simply clears it.
  setCategoryHidden: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        hidden: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      // This check does not filter on deleted_at, so it finds a hidden category
      // too, which unhiding depends on.
      await assertCategoryInBudget(ctx, input.categoryId, input.budgetId);

      await ctx.db
        .update(categories)
        .set({
          deletedAt: input.hidden ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(categories.id, input.categoryId),
            eq(categories.budgetId, input.budgetId)
          )
        );
    }),

  // Set the budgeted amount for a category in a month
  setBudgeted: protectedProcedure
    .input(setBudgetedSchema.extend({ budgetId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      await assertCategoryInBudget(ctx, input.categoryId, input.budgetId);

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

  // The amounts behind the Quick Budget buttons for one category.
  quickBudget: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      await assertCategoryInBudget(ctx, input.categoryId, input.budgetId);

      const [activity, income, budgetedRows] = await loadBudgetInputs(
        ctx.db,
        input.budgetId
      );

      return computeQuickBudget({
        activity,
        income,
        budgeted: budgetedRows,
        targetMonth: input.month.slice(0, 7),
        categoryId: input.categoryId,
      });
    }),

  // Move budgeted dollars from one category to another within a month. YNAB 4's
  // answer to overspending. Both sides move together or not at all.
  moveMoney: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        fromCategoryId: z.number().int().positive(),
        toCategoryId: z.number().int().positive(),
        amount: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromCategoryId === input.toCategoryId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pick two different categories",
        });
      }
      await assertBudgetAccess(ctx, input.budgetId);
      await assertCategoryInBudget(ctx, input.fromCategoryId, input.budgetId);
      await assertCategoryInBudget(ctx, input.toCategoryId, input.budgetId);

      await ctx.db.transaction(async (tx) => {
        const rows = await tx.query.monthlyBudgets.findMany({
          where: (mb, { eq, and, inArray, isNull }) =>
            and(
              eq(mb.budgetId, input.budgetId),
              eq(mb.month, input.month),
              isNull(mb.deletedAt),
              inArray(mb.categoryId, [input.fromCategoryId, input.toCategoryId])
            ),
        });
        const budgetedFor = (categoryId: number) =>
          Math.round(
            parseFloat(rows.find((r) => r.categoryId === categoryId)?.budgeted ?? "0") * 100
          );

        const delta = Math.round(input.amount * 100);
        const moves = [
          { categoryId: input.fromCategoryId, cents: budgetedFor(input.fromCategoryId) - delta },
          { categoryId: input.toCategoryId, cents: budgetedFor(input.toCategoryId) + delta },
        ];

        for (const move of moves) {
          await tx
            .insert(monthlyBudgets)
            .values({
              ynabId: `MCB/${input.month.slice(0, 7)}/${move.categoryId}`,
              budgetId: input.budgetId,
              categoryId: move.categoryId,
              month: input.month,
              budgeted: String(move.cents / 100),
            })
            .onConflictDoUpdate({
              target: [monthlyBudgets.categoryId, monthlyBudgets.month],
              set: { budgeted: String(move.cents / 100), updatedAt: new Date() },
            });
        }
      });
    }),

  // Confining overspending keeps a category's shortfall with the category
  // instead of taking it out of next month's To-be-Budgeted.
  setOverspendingHandling: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        confined: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      await assertCategoryInBudget(ctx, input.categoryId, input.budgetId);

      const handling = input.confined ? "Confined" : null;

      await ctx.db
        .insert(monthlyBudgets)
        .values({
          ynabId: `MCB/${input.month.slice(0, 7)}/${input.categoryId}`,
          budgetId: input.budgetId,
          categoryId: input.categoryId,
          month: input.month,
          budgeted: "0",
          overspendingHandling: handling,
        })
        .onConflictDoUpdate({
          target: [monthlyBudgets.categoryId, monthlyBudgets.month],
          set: { overspendingHandling: handling, updatedAt: new Date() },
        });
    }),

  // Set, change or clear a category's YNAB 4 goal. Clearing the type clears the
  // target and target month with it, so a category never keeps a stale goal.
  setCategoryGoal: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        goalType: z.enum(["TB", "TBD", "MF"]).nullable(),
        target: z.number().positive().optional(),
        targetMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      await assertCategoryInBudget(ctx, input.categoryId, input.budgetId);

      if (input.goalType !== null) {
        if (!input.target) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A goal needs a positive target amount",
          });
        }
        if (input.goalType === "TBD" && !input.targetMonth) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A target-by-date goal needs a target month",
          });
        }
      }

      await ctx.db
        .update(categories)
        .set({
          goalType: input.goalType,
          goalTarget: input.goalType ? String(input.target) : null,
          goalTargetMonth: input.goalType === "TBD" ? (input.targetMonth ?? null) : null,
          updatedAt: new Date(),
        })
        .where(and(eq(categories.id, input.categoryId), eq(categories.budgetId, input.budgetId)));
    }),

  // A category's budgeted/spent history for the N months ending at (and
  // including) the given month, oldest first. Powers the goal progress chart:
  // months with no activity or budgeting still appear, at zero, so the series
  // stays continuous.
  categoryHistory: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        months: z.number().int().positive().default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      await assertCategoryInBudget(ctx, input.categoryId, input.budgetId);

      const [activity, , budgetedRows] = await loadBudgetInputs(ctx.db, input.budgetId);

      const budgetedByMonth = new Map(
        budgetedRows
          .filter((r) => r.categoryId === input.categoryId)
          .map((r) => [r.month, r.budgeted])
      );
      const activityByMonth = new Map(
        activity
          .filter((r) => r.categoryId === input.categoryId)
          .map((r) => [r.month, r])
      );
      const toCents = (v: string | null | undefined) => Math.round(parseFloat(v ?? "0") * 100);

      const targetIdx = monthIndex(input.month.slice(0, 7));
      const history: { month: string; budgeted: number; spent: number }[] = [];
      for (let i = input.months - 1; i >= 0; i--) {
        const month = monthFromIndex(targetIdx - i);
        const act = activityByMonth.get(month);
        // Outflow as a positive amount; a net inflow month (a refund) reports zero.
        const net = toCents(act?.cash) + toCents(act?.credit);
        history.push({
          month,
          budgeted: toCents(budgetedByMonth.get(month)) / 100,
          spent: (net < 0 ? -net : 0) / 100,
        });
      }
      return history;
    }),
});

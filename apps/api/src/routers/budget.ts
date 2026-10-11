import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, budgetProcedure } from "../trpc";
import { budgets, monthlyBudgets, categories } from "@znab/db";
import {
  fromCents,
  GOAL_TYPES,
  type GoalType,
  moneySchema,
  roundMoney,
  setBudgetedSchema,
  toCents,
} from "@znab/shared";
import { assertIdsInBudget } from "../lib/authz";
import {
  categoryActivitySource,
  loadBudgetInputs,
  upsertMonthlyBudget,
} from "../lib/budget-queries";
import { isoDateSchema } from "../lib/input";
import {
  computeBudgetMonth,
  computeQuickBudget,
  computeCategoryGoal,
  monthIndex,
  monthFromIndex,
  type CategoryGoal,
} from "../lib/budget-math";

// Re-exported so the web client keeps importing these from the router it calls.
export type { MonthSummary, CategoryMonth, CategoryGoal } from "../lib/budget-math";

export const budgetRouter = router({
  // List all budgets for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.budgets.findMany({
      where: eq(budgets.userId, ctx.user.id),
      orderBy: (b, { asc }) => [asc(b.name)],
    });
  }),

  // Get a single budget by id (must belong to user)
  byId: budgetProcedure.query(({ ctx }) => ctx.budget),

  // Get all months that have data for a budget
  months: budgetProcedure
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

  // Full budget view for a single month: category groups + each category's
  // month-end balance/activity + the "Available to Budget" summary, all from one
  // rolling pass so the grid and the header stay consistent.
  monthBudget: budgetProcedure
    .input(
      z.object({
        month: isoDateSchema, // first-of-month
      })
    )
    .query(async ({ ctx, input }) => {
      // All reads are independent, so issue them together.
      const [groups, [activity, income, budgetedRows], hiddenRows] =
        await Promise.all([
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
  setCategoryHidden: budgetProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        hidden: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // This check does not filter on deleted_at, so it finds a hidden category
      // too, which unhiding depends on.
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.categoryId });

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
  setBudgeted: budgetProcedure
    .input(setBudgetedSchema)
    .mutation(async ({ ctx, input }) => {
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.categoryId });

      await upsertMonthlyBudget(ctx.db, input, { budgeted: String(input.budgeted) });
    }),

  // The amounts behind the Quick Budget buttons for one category.
  quickBudget: budgetProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        month: isoDateSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.categoryId });

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
  moveMoney: budgetProcedure
    .input(
      z.object({
        month: isoDateSchema,
        fromCategoryId: z.number().int().positive(),
        toCategoryId: z.number().int().positive(),
        amount: moneySchema.positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromCategoryId === input.toCategoryId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pick two different categories",
        });
      }
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.fromCategoryId });
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.toCategoryId });

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
          toCents(rows.find((r) => r.categoryId === categoryId)?.budgeted);

        const delta = toCents(input.amount);
        const moves = [
          { categoryId: input.fromCategoryId, cents: budgetedFor(input.fromCategoryId) - delta },
          { categoryId: input.toCategoryId, cents: budgetedFor(input.toCategoryId) + delta },
        ];

        for (const move of moves) {
          await upsertMonthlyBudget(
            tx,
            { budgetId: input.budgetId, categoryId: move.categoryId, month: input.month },
            { budgeted: String(fromCents(move.cents)) }
          );
        }
      });
    }),

  // Confining overspending keeps a category's shortfall with the category
  // instead of taking it out of next month's To-be-Budgeted.
  setOverspendingHandling: budgetProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        month: isoDateSchema,
        confined: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.categoryId });

      // The setting carries forward to later months, so turning it off has to
      // be recorded explicitly rather than cleared back to null.
      const handling = input.confined ? "Confined" : "AffectsBuffer";

      await upsertMonthlyBudget(ctx.db, input, { overspendingHandling: handling });
    }),

  // Set, change or clear a category's YNAB 4 goal. Clearing the type clears the
  // target and target month with it, so a category never keeps a stale goal.
  setCategoryGoal: budgetProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        goalType: z.enum(GOAL_TYPES).nullable(),
        target: moneySchema.positive().optional(),
        targetMonth: isoDateSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.categoryId });

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
  categoryHistory: budgetProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        month: isoDateSchema,
        months: z.number().int().positive().default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.categoryId });

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

      const targetIdx = monthIndex(input.month.slice(0, 7));
      const history: { month: string; budgeted: number; spent: number }[] = [];
      for (let i = input.months - 1; i >= 0; i--) {
        const month = monthFromIndex(targetIdx - i);
        const act = activityByMonth.get(month);
        // Outflow as a positive amount; a net inflow month (a refund) reports zero.
        const net = toCents(act?.amount);
        history.push({
          month,
          budgeted: roundMoney(budgetedByMonth.get(month)),
          spent: fromCents(net < 0 ? -net : 0),
        });
      }
      return history;
    }),

  // Every transaction behind a category's Spent figure for one month, newest
  // first. A split part stands in its parent's place, so `transactionId` is
  // always a row the register shows. Read off the same source the engine
  // totals, so `total` is the Spent cell to the cent.
  categoryTransactions: budgetProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        month: isoDateSchema, // first-of-month
      })
    )
    .query(async ({ ctx, input }) => {
      await assertIdsInBudget(ctx.db, input.budgetId, { categoryId: input.categoryId });

      const rows = (await ctx.db.execute(sql`
        SELECT
          x.transaction_id AS "transactionId",
          x.sub_transaction_id AS "subTransactionId",
          x.account_id AS "accountId",
          a.name AS "accountName",
          to_char(x.d, 'YYYY-MM-DD') AS date,
          p.name AS "payeeName",
          x.memo,
          x.amount
        FROM (${categoryActivitySource(input.budgetId)}) x
        JOIN accounts a ON a.id = x.account_id
        LEFT JOIN payees p ON p.id = x.payee_id
        WHERE x.category_id = ${input.categoryId}
          AND x.d >= ${input.month}::date
          AND x.d < ${input.month}::date + interval '1 month'
        ORDER BY x.d DESC, x.transaction_id DESC, x.sub_transaction_id
      `)) as unknown as {
        transactionId: number;
        subTransactionId: number | null;
        accountId: number;
        accountName: string;
        date: string;
        payeeName: string | null;
        memo: string | null;
        amount: string;
      }[];

      // Summed in cents, the way the engine sums, so the total cannot pick up
      // a stray fraction the Spent cell does not have.
      const totalCents = rows.reduce((sum, r) => sum + toCents(r.amount), 0);
      return {
        transactions: rows.map((r) => ({ ...r, amount: parseFloat(r.amount) })),
        total: fromCents(totalCents),
      };
    }),
});

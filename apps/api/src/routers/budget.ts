import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { budgets, monthlyBudgets, categories } from "@znab/db";
import { setBudgetedSchema } from "@znab/shared";

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

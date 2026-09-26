import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError, type inferRouterOutputs } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { budgets, categoryGroups, householdSplitSettings } from "@znab/db";
import { assertBudgetAccess, type AuthedContext } from "../lib/authz";
import { computeBudgetMonth } from "../lib/budget-math";
import { computeHouseholdSplit } from "../lib/household-split";
import { loadBudgetInputs } from "./budget";

const DEFAULT_SAVINGS_PERCENT = 40;

/** The groups a person can count towards master budgets: their own, still in use. */
const userGroups = (budgetId: number) =>
  and(
    eq(categoryGroups.budgetId, budgetId),
    eq(categoryGroups.isSystem, false),
    isNull(categoryGroups.deletedAt)
  );

/**
 * One person's column of the spreadsheet for a month. Income is exactly the
 * budget page's "Income for" figure; master is what was budgeted this month in
 * every flagged group, hidden categories included, since hiding one does not
 * take back what it was given.
 */
async function personMonth(ctx: AuthedContext, budgetId: number, month: string) {
  const [[activity, income, budgeted], groups] = await Promise.all([
    loadBudgetInputs(ctx.db, budgetId),
    ctx.db.query.categoryGroups.findMany({
      where: and(userGroups(budgetId), eq(categoryGroups.inMasterBudgets, true)),
      orderBy: (cg, { asc }) => [asc(cg.sortOrder)],
      columns: { name: true },
      with: { categories: { columns: { id: true } } },
    }),
  ]);

  const { summary, categories } = computeBudgetMonth({
    activity,
    income,
    budgeted,
    targetMonth: month.slice(0, 7),
  });

  let masterCents = 0;
  for (const group of groups) {
    for (const cat of group.categories) {
      masterCents += Math.round((categories.get(cat.id)?.budgeted ?? 0) * 100);
    }
  }

  return {
    income: summary.income,
    master: masterCents / 100,
    groups: groups.map((g) => g.name),
  };
}

export const householdSplitRouter = router({
  // The user's split settings, falling back to defaults before they have saved
  // any, plus every budget of theirs with the groups that could be flagged.
  settings: protectedProcedure.query(async ({ ctx }) => {
    const [row, userBudgets] = await Promise.all([
      ctx.db.query.householdSplitSettings.findFirst({
        where: eq(householdSplitSettings.userId, ctx.user.id),
      }),
      ctx.db.query.budgets.findMany({
        where: eq(budgets.userId, ctx.user.id),
        orderBy: (b, { asc }) => [asc(b.name)],
        columns: { id: true, name: true },
        with: {
          categoryGroups: {
            where: (cg, { eq, and, isNull }) =>
              and(eq(cg.isSystem, false), isNull(cg.deletedAt)),
            orderBy: (cg, { asc }) => [asc(cg.sortOrder)],
            columns: { id: true, name: true, inMasterBudgets: true },
          },
        },
      }),
    ]);

    return {
      primaryBudgetId: row?.primaryBudgetId ?? null,
      partnerBudgetId: row?.partnerBudgetId ?? null,
      savingsPercent: row ? parseFloat(row.savingsPercent) : DEFAULT_SAVINGS_PERCENT,
      budgets: userBudgets.map(({ categoryGroups: groups, ...b }) => ({ ...b, groups })),
    };
  }),

  updateSettings: protectedProcedure
    .input(
      z
        .object({
          primaryBudgetId: z.number().int().positive(),
          partnerBudgetId: z.number().int().positive(),
          savingsPercent: z.number().min(0).max(100),
        })
        .refine((v) => v.primaryBudgetId !== v.partnerBudgetId, {
          message: "Pick two different budgets",
        })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.primaryBudgetId);
      await assertBudgetAccess(ctx, input.partnerBudgetId);

      const values = {
        primaryBudgetId: input.primaryBudgetId,
        partnerBudgetId: input.partnerBudgetId,
        savingsPercent: String(input.savingsPercent),
      };
      await ctx.db
        .insert(householdSplitSettings)
        .values({ userId: ctx.user.id, ...values })
        .onConflictDoUpdate({
          target: householdSplitSettings.userId,
          set: { ...values, updatedAt: new Date() },
        });
    }),

  setGroupFlag: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        groupId: z.number().int().positive(),
        inMasterBudgets: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      // Constraining the update to the budget makes a group from anywhere else
      // simply match nothing.
      const updated = await ctx.db
        .update(categoryGroups)
        .set({ inMasterBudgets: input.inMasterBudgets, updatedAt: new Date() })
        .where(and(eq(categoryGroups.id, input.groupId), userGroups(input.budgetId)))
        .returning({ id: categoryGroups.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Category group not found" });
      }
    }),

  month: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })) // first-of-month
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.householdSplitSettings.findFirst({
        where: eq(householdSplitSettings.userId, ctx.user.id),
      });
      if (!row?.primaryBudgetId || !row.partnerBudgetId) {
        return { configured: false as const };
      }

      // The settings may name a budget the user no longer owns.
      const [primaryBudget, partnerBudget] = await Promise.all([
        assertBudgetAccess(ctx, row.primaryBudgetId),
        assertBudgetAccess(ctx, row.partnerBudgetId),
      ]);
      const [primary, partner] = await Promise.all([
        personMonth(ctx, primaryBudget.id, input.month),
        personMonth(ctx, partnerBudget.id, input.month),
      ]);
      const savingsPercent = parseFloat(row.savingsPercent);

      return {
        configured: true as const,
        primary: { budgetId: primaryBudget.id, name: primaryBudget.name, ...primary },
        partner: { budgetId: partnerBudget.id, name: partnerBudget.name, ...partner },
        savingsPercent,
        ...computeHouseholdSplit({ primary, partner, savingsPercent }),
      };
    }),
});

// Exported so the web client can name what these procedures return.
export type HouseholdSplitOutputs = inferRouterOutputs<typeof householdSplitRouter>;

import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { payees, budgets } from "@znab/db";

export const payeeRouter = router({
  list: protectedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const budget = await ctx.db.query.budgets.findFirst({
        where: and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id)),
      });
      if (!budget) throw new Error("Budget not found");

      return ctx.db.query.payees.findMany({
        where: and(
          eq(payees.budgetId, input.budgetId),
          isNull(payees.deletedAt),
          eq(payees.enabled, true),
        ),
        orderBy: (p, { asc }) => [asc(p.name)],
        columns: { id: true, name: true },
      });
    }),
});

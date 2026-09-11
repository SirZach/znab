import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { categoryGroups } from "@znab/db";
import { assertBudgetAccess } from "../lib/authz";

export const categoryRouter = router({
  // Category groups and their categories for a budget.
  //
  // Categories belong to the budget, not to a month — only their allocations
  // are month-scoped. Anything that just needs the list of envelopes (the
  // register's category picker, say) should read this rather than pull a
  // month's worth of budget data and discard the allocations.
  list: protectedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.query.categoryGroups.findMany({
        where: and(
          eq(categoryGroups.budgetId, input.budgetId),
          isNull(categoryGroups.deletedAt)
        ),
        orderBy: (cg, { asc }) => [asc(cg.sortOrder)],
        columns: { id: true, name: true, isSystem: true },
        with: {
          categories: {
            where: (c, { isNull }) => isNull(c.deletedAt),
            orderBy: (c, { asc }) => [asc(c.sortOrder)],
            columns: { id: true, name: true },
          },
        },
      });
    }),
});

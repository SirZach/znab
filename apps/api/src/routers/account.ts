import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { accounts, transactions, budgets } from "@znab/db";

export const accountRouter = router({
  // All accounts for a budget
  list: protectedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      // Verify budget belongs to user
      const budget = await ctx.db.query.budgets.findFirst({
        where: and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id)),
      });
      if (!budget) throw new Error("Budget not found");

      return ctx.db.query.accounts.findMany({
        where: and(
          eq(accounts.budgetId, input.budgetId),
          isNull(accounts.deletedAt)
        ),
        orderBy: (a, { asc }) => [asc(a.sortOrder)],
      });
    }),

  // Transactions for a single account
  transactions: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        accountId: z.number().int().positive(),
        cleared: z.enum(["all", "Uncleared", "Cleared", "Reconciled"]).default("all"),
        q: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.transactions.findMany({
        where: (t, { eq, and, isNull, like, ne }) => {
          const conditions = [
            eq(t.budgetId, input.budgetId),
            eq(t.accountId, input.accountId),
            isNull(t.deletedAt),
          ];
          if (input.cleared !== "all") {
            conditions.push(eq(t.cleared, input.cleared));
          }
          if (input.q) {
            conditions.push(like(t.memo, `%${input.q}%`));
          }
          return and(...conditions);
        },
        with: {
          payee: true,
          category: true,
          subTransactions: { with: { category: true } },
        },
        orderBy: (t, { desc }) => [desc(t.date), desc(t.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });

      return rows;
    }),
});

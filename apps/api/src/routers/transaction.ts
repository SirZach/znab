import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { transactions, payees, budgets } from "@znab/db";
import { createTransactionSchema, updateTransactionSchema } from "@znab/shared";
import { TRPCError } from "@trpc/server";

export const transactionRouter = router({
  create: protectedProcedure
    .input(
      createTransactionSchema.extend({
        budgetId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify budget ownership
      const budget = await ctx.db.query.budgets.findFirst({
        where: and(eq(budgets.id, input.budgetId), eq(budgets.userId, ctx.user.id)),
      });
      if (!budget) throw new TRPCError({ code: "NOT_FOUND" });

      // Handle on-the-fly payee creation
      let payeeId = input.payeeId;
      if (!payeeId && input.payeeName) {
        const [newPayee] = await ctx.db
          .insert(payees)
          .values({
            ynabId: `Payee/${crypto.randomUUID()}`,
            budgetId: input.budgetId,
            name: input.payeeName,
          })
          .returning();
        payeeId = newPayee!.id;
      }

      const [txn] = await ctx.db
        .insert(transactions)
        .values({
          ynabId: crypto.randomUUID(),
          budgetId: input.budgetId,
          accountId: input.accountId,
          payeeId,
          categoryId: input.categoryId,
          amount: String(input.amount),
          date: input.date,
          cleared: input.cleared,
          accepted: input.accepted,
          memo: input.memo,
          flagColor: input.flagColor,
        })
        .returning();

      return txn;
    }),

  update: protectedProcedure
    .input(updateTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(transactions)
        .set({ ...rest, amount: rest.amount != null ? String(rest.amount) : undefined, updatedAt: new Date() })
        .where(eq(transactions.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(transactions)
        .set({ deletedAt: new Date() })
        .where(eq(transactions.id, input.id));
    }),

  setClearedStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        cleared: z.enum(["Uncleared", "Cleared", "Reconciled"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(transactions)
        .set({ cleared: input.cleared, updatedAt: new Date() })
        .where(eq(transactions.id, input.id));
    }),
});

import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { transactions, payees, budgets } from "@znab/db";
import { createTransactionSchema, updateTransactionSchema } from "@znab/shared";
import { TRPCError } from "@trpc/server";
import { ownedBudgetIds } from "../lib/authz";

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
      // `payeeName` is accepted on create to make a payee on the fly; there is
      // no equivalent on update yet, and it is not a column, so drop it rather
      // than hand it to the query builder.
      const { id, payeeName, amount, ...rest } = input;

      const [updated] = await ctx.db
        .update(transactions)
        .set({
          ...rest,
          ...(amount != null ? { amount: String(amount) } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(transactions.id, id),
            inArray(transactions.budgetId, ownedBudgetIds(ctx))
          )
        )
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .update(transactions)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(transactions.id, input.id),
            inArray(transactions.budgetId, ownedBudgetIds(ctx))
          )
        )
        .returning({ id: transactions.id });

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
    }),

  setClearedStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        cleared: z.enum(["Uncleared", "Cleared", "Reconciled"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(transactions)
        .set({ cleared: input.cleared, updatedAt: new Date() })
        .where(
          and(
            eq(transactions.id, input.id),
            inArray(transactions.budgetId, ownedBudgetIds(ctx))
          )
        )
        .returning({ id: transactions.id });

      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    }),
});

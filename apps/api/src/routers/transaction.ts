import { z } from "zod";
import { eq, and, inArray, isNull, ne } from "drizzle-orm";
import { router, protectedProcedure, budgetProcedure } from "../trpc";
import { transactions, payees, accounts } from "@znab/db";
import { createTransactionSchema, updateTransactionSchema } from "@znab/shared";
import { TRPCError } from "@trpc/server";
import { assertIdsInBudget, ownedBudgetIds, type AuthedContext } from "../lib/authz";
import { findOrCreatePayee } from "../lib/find-or-create-payee";
import { transferCategoryId } from "../lib/transfer";
import { writeTransferPair } from "../lib/transfer-write";

/**
 * Where the other half of a transfer lives. YNAB 4 pairs the two sides by ynab
 * id rather than row id, and the budget travels with it because a ynab id is
 * only unique within one budget.
 */
function counterpartWhere(
  ctx: AuthedContext,
  budgetId: number,
  transferTransactionId: string
) {
  return and(
    eq(transactions.ynabId, transferTransactionId),
    eq(transactions.budgetId, budgetId),
    isNull(transactions.deletedAt),
    inArray(transactions.budgetId, ownedBudgetIds(ctx))
  );
}

/** The other half's cleared status, when there is another half to find. */
async function counterpartCleared(
  // Narrowed the way `assertIdsInBudget` is, so the caller inside an open
  // transaction does not have to reach outside it.
  db: Pick<AuthedContext["db"], "select">,
  ctx: AuthedContext,
  row: { budgetId: number; isTransfer: boolean; transferTransactionId: string | null }
) {
  if (!row.isTransfer || !row.transferTransactionId) return null;
  const [far] = await db
    .select({ cleared: transactions.cleared })
    .from(transactions)
    .where(counterpartWhere(ctx, row.budgetId, row.transferTransactionId))
    .limit(1);
  return far?.cleared ?? null;
}

/**
 * A reconciled transaction is one a statement has already been balanced
 * against, so changing it puts the account out of step with that statement.
 * YNAB 4 warns and then lets the change through, and that is what the
 * acknowledgement carries: the client has shown the warning and the user chose
 * to go ahead anyway. Both halves of a transfer are judged, since an edit
 * crosses over and a delete takes both.
 */
function assertReconciledAcknowledged(
  near: string,
  far: string | null,
  acknowledged: boolean | undefined,
  verb: "Editing" | "Deleting"
) {
  const subject =
    near === "Reconciled"
      ? "This transaction is reconciled"
      : far === "Reconciled"
        ? "The other side of this transfer is reconciled"
        : null;
  if (!subject || acknowledged) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `${subject}. ${verb} it would put the account out of step with the statement it was reconciled against.`,
  });
}

export const transactionRouter = router({
  create: budgetProcedure
    .input(createTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      // The payee is read scoped below, since a transfer is declared through
      // it; the account and category get the same treatment here.
      await assertIdsInBudget(ctx.db, input.budgetId, {
        categoryId: input.categoryId,
        accountId: input.accountId,
      });

      // The on-the-fly payee and the row that names it are written together,
      // so a refused row does not leave a payee nobody asked for behind it.
      return ctx.db.transaction(async (tx) => {
        let payeeId = input.payeeId;
        if (!payeeId && input.payeeName) {
          payeeId = (await findOrCreatePayee(tx, input.budgetId, input.payeeName)) ?? payeeId;
        }

        // A transfer is declared the way YNAB 4 declares one, by choosing the
        // payee that stands in for the other account, so the payee has to be
        // read before the row can be written. Scoped to the budget, since a
        // payee id off the wire says nothing about where it lives.
        const payee = payeeId
          ? await tx.query.payees.findFirst({
              where: and(
                eq(payees.id, payeeId),
                eq(payees.budgetId, input.budgetId),
                isNull(payees.deletedAt)
              ),
              columns: { id: true, name: true, targetAccountId: true },
            })
          : null;
        if (payeeId && !payee) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Payee not found" });
        }

        if (payee && payee.targetAccountId !== null) {
          return writeTransferPair(
            tx,
            input.budgetId,
            input.accountId,
            { ...payee, targetAccountId: payee.targetAccountId },
            {
              amount: input.amount,
              date: input.date,
              categoryId: input.categoryId,
              memo: input.memo,
              near: { cleared: input.cleared, accepted: input.accepted, flagColor: input.flagColor },
            }
          );
        }

        const [txn] = await tx
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
      });
    }),

  update: protectedProcedure
    .input(
      updateTransactionSchema.extend({
        acknowledgeReconciled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // `payeeName` makes a payee on the fly and `acknowledgeReconciled` is the
      // user's answer to a warning, so neither is a column and neither reaches
      // the query builder. `payeeId`, `categoryId` and `amount` are pulled out
      // because a transfer decides them for itself; everything left in `rest`
      // is written as sent, absent keys included.
      const { id, payeeName, payeeId, categoryId, amount, acknowledgeReconciled, ...rest } =
        input;

      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .select({
            budgetId: transactions.budgetId,
            accountId: transactions.accountId,
            cleared: transactions.cleared,
            isTransfer: transactions.isTransfer,
            transferAccountId: transactions.transferAccountId,
            transferTransactionId: transactions.transferTransactionId,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.id, id),
              inArray(transactions.budgetId, ownedBudgetIds(ctx))
            )
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        assertReconciledAcknowledged(
          row.cleared,
          await counterpartCleared(tx, ctx, row),
          acknowledgeReconciled,
          "Editing"
        );

        // Repointing one side of a transfer at an ordinary payee would leave
        // the other side taking money from an account that no longer claims
        // it, and nothing on screen would say so. Moving the row to a third
        // account is the same wound from the other direction: the counterpart
        // would still name the account the money has left.
        if (
          row.isTransfer &&
          (payeeId !== undefined ||
            payeeName !== undefined ||
            (rest.accountId !== undefined && rest.accountId !== row.accountId))
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The payee of a transfer is the account it moves money to. Delete this transaction and enter it again to send it somewhere else.",
          });
        }

        // Owning the row proves nothing about the ids sent to go in it, and an
        // ordinary edit writes all three straight through.
        await assertIdsInBudget(tx, row.budgetId, {
          payeeId,
          categoryId,
          accountId: rest.accountId,
        });

        let resolvedPayeeId = payeeId;
        if (!resolvedPayeeId && payeeName) {
          resolvedPayeeId = (await findOrCreatePayee(tx, row.budgetId, payeeName)) ?? resolvedPayeeId;
        }

        // Which side of a transfer carries the category follows from the two
        // accounts rather than from where the client put it, so a category
        // entered on the off-budget side lands on the on-budget one.
        const farAccountId = row.transferAccountId;
        let nearCategoryId = categoryId;
        let farCategoryId: number | null | undefined;
        if (row.isTransfer && categoryId !== undefined && farAccountId !== null) {
          const ends = await tx.query.accounts.findMany({
            where: and(
              inArray(accounts.id, [row.accountId, farAccountId]),
              eq(accounts.budgetId, row.budgetId)
            ),
            columns: { id: true, onBudget: true },
          });
          const near = ends.find((a) => a.id === row.accountId);
          const far = ends.find((a) => a.id === farAccountId);
          if (near && far) {
            nearCategoryId = transferCategoryId(near, far, categoryId);
            farCategoryId = transferCategoryId(far, near, categoryId);
          }
        }

        const [updated] = await tx
          .update(transactions)
          .set({
            ...rest,
            ...(resolvedPayeeId !== undefined ? { payeeId: resolvedPayeeId } : {}),
            ...(nearCategoryId !== undefined ? { categoryId: nearCategoryId } : {}),
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

        // Only what both sides share crosses over. `cleared`, `accepted`,
        // `memo` and `flagColor` stay on the row that was edited, since each
        // side clears and is filed in its own account. One genuinely
        // half-paired transfer survives in the imported data, so a counterpart
        // that cannot be found updates nothing rather than failing the edit.
        if (row.isTransfer && row.transferTransactionId) {
          await tx
            .update(transactions)
            .set({
              ...(rest.date !== undefined ? { date: rest.date } : {}),
              ...(amount != null ? { amount: String(-amount) } : {}),
              ...(farCategoryId !== undefined ? { categoryId: farCategoryId } : {}),
              updatedAt: new Date(),
            })
            .where(counterpartWhere(ctx, row.budgetId, row.transferTransactionId));
        }

        return updated!;
      });
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        acknowledgeReconciled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        // Read before writing, so a refused delete leaves the row alone rather
        // than leaning on the rollback to put it back. The write below still
        // carries ownership scoping of its own.
        const [row] = await tx
          .select({
            budgetId: transactions.budgetId,
            cleared: transactions.cleared,
            isTransfer: transactions.isTransfer,
            transferTransactionId: transactions.transferTransactionId,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.id, input.id),
              inArray(transactions.budgetId, ownedBudgetIds(ctx))
            )
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        assertReconciledAcknowledged(
          row.cleared,
          await counterpartCleared(tx, ctx, row),
          input.acknowledgeReconciled,
          "Deleting"
        );

        await tx
          .update(transactions)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(transactions.id, input.id),
              inArray(transactions.budgetId, ownedBudgetIds(ctx))
            )
          );

        // Both halves go together, or the account left holding one shows money
        // arriving from nowhere. A counterpart already gone leaves nothing to do.
        if (row.isTransfer && row.transferTransactionId) {
          await tx
            .update(transactions)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(counterpartWhere(ctx, row.budgetId, row.transferTransactionId));
        }
      });
    }),

  // Ticking a transaction as the bank shows it, and unticking it again.
  // Reconciled is not on offer: it is what reconciling an account against a
  // statement sets, and a row that has been through that is no longer the
  // register's to change.
  setClearedStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        cleared: z.enum(["Uncleared", "Cleared"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(transactions)
        .set({ cleared: input.cleared, updatedAt: new Date() })
        .where(
          and(
            eq(transactions.id, input.id),
            ne(transactions.cleared, "Reconciled"),
            inArray(transactions.budgetId, ownedBudgetIds(ctx))
          )
        )
        .returning({ id: transactions.id });

      if (!updated) {
        // The update refuses a reconciled row in its own WHERE, so nothing
        // matching means one of two things. Telling them apart takes a second
        // look, scoped the same way.
        const [row] = await ctx.db
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.id, input.id),
              inArray(transactions.budgetId, ownedBudgetIds(ctx))
            )
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This transaction was reconciled. Reconciling the account against a statement is what sets that, so it cannot be ticked back by hand.",
        });
      }
    }),
});

import { z } from "zod";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { router, protectedProcedure, budgetProcedure } from "../trpc";
import { transactions, payees, accounts } from "@znab/db";
import { createTransactionSchema, isIncomeCategoryId, updateTransactionSchema } from "@znab/shared";
import { TRPCError } from "@trpc/server";
import { audit } from "../lib/audit";
import { assertIdsInBudget, ownedBudgetIds, type AuthedContext } from "../lib/authz";
import { categoryColumns, categoryRowId } from "../lib/category-columns";
import { findOrCreatePayee } from "../lib/find-or-create-payee";
import { transferCategoryId } from "../lib/transfer";
import {
  insertTransferFarSide,
  resolveTransferEnds,
  writeTransferPair,
} from "../lib/transfer-write";
import type { Tx } from "../lib/tx";

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

/**
 * The other half of a transfer as stored, when there is another half to find:
 * its cleared status is judged alongside the near side's, and the whole row is
 * what the audit log records it was. Locked, like the near side, so that row
 * cannot change between being read and being written.
 */
async function loadCounterpart(
  tx: Tx,
  ctx: AuthedContext,
  row: { budgetId: number; isTransfer: boolean; transferTransactionId: string | null }
) {
  if (!row.isTransfer || !row.transferTransactionId) return null;
  const [far] = await tx
    .select()
    .from(transactions)
    .where(counterpartWhere(ctx, row.budgetId, row.transferTransactionId))
    .limit(1)
    .for("update");
  return far ?? null;
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
        categoryId: categoryRowId(input.categoryId),
        accountId: input.accountId,
      });

      // The on-the-fly payee and the row that names it are written together,
      // so a refused row does not leave a payee nobody asked for behind it.
      return ctx.db.transaction(async (tx) => {
        let payeeId = input.payeeId;
        if (!payeeId && input.payeeName) {
          payeeId =
            (await findOrCreatePayee(tx, input.budgetId, input.payeeName, {
              categoryId: input.categoryId,
            })) ?? payeeId;
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
            ctx.user.id,
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
            ...categoryColumns(input.categoryId),
            amount: String(input.amount),
            date: input.date,
            cleared: input.cleared,
            accepted: input.accepted,
            memo: input.memo,
            flagColor: input.flagColor,
          })
          .returning();

        await audit(tx, ctx.user.id, "transaction", { after: [txn!] });
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
        // Locked, so the row the audit log records as "before" is the row the
        // update below actually changes.
        const [row] = await tx
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.id, id),
              inArray(transactions.budgetId, ownedBudgetIds(ctx))
            )
          )
          .limit(1)
          .for("update");
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const farBefore = await loadCounterpart(tx, ctx, row);
        assertReconciledAcknowledged(
          row.cleared,
          farBefore?.cleared ?? null,
          acknowledgeReconciled,
          "Editing"
        );

        // Moving one side of a transfer to a third account would leave the
        // counterpart naming the account the money has left.
        if (row.isTransfer && rest.accountId !== undefined && rest.accountId !== row.accountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "One side of a transfer cannot move to another account. Delete this transaction and enter it again in the account it belongs to.",
          });
        }

        // Owning the row proves nothing about the ids sent to go in it, and an
        // ordinary edit writes all three straight through.
        await assertIdsInBudget(tx, row.budgetId, {
          payeeId,
          categoryId: categoryRowId(categoryId),
          accountId: rest.accountId,
        });

        // An edit that leaves the category alone still has one: the row's own.
        const rowCategoryId = isIncomeCategoryId(row.categoryYnabId)
          ? row.categoryYnabId
          : row.categoryId;

        let resolvedPayeeId = payeeId;
        if (!resolvedPayeeId && payeeName) {
          resolvedPayeeId =
            (await findOrCreatePayee(tx, row.budgetId, payeeName, {
              categoryId: categoryId !== undefined ? categoryId : rowCategoryId,
            })) ?? resolvedPayeeId;
        }

        // The payee says whether the row is a transfer and where to, as it does
        // on create. One that points somewhere other than the row's counterpart
        // relinks it: the old counterpart goes, and a new one is made in the
        // account the payee stands in for.
        const nextPayee = resolvedPayeeId
          ? await tx.query.payees.findFirst({
              where: and(
                eq(payees.id, resolvedPayeeId),
                eq(payees.budgetId, row.budgetId),
                isNull(payees.deletedAt)
              ),
              columns: { id: true, name: true, targetAccountId: true },
            })
          : null;
        if (resolvedPayeeId && !nextPayee) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Payee not found" });
        }
        // A transfer with no payee at all would silently lose its other half.
        // Picking an ordinary payee is how a transfer becomes an ordinary row.
        if (row.isTransfer && resolvedPayeeId === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pick a payee to turn this transfer back into an ordinary transaction.",
          });
        }
        const currentTarget = row.isTransfer ? row.transferAccountId : null;
        const nextTarget =
          resolvedPayeeId === undefined ? currentTarget : (nextPayee?.targetAccountId ?? null);
        const relinks = nextTarget !== currentTarget;

        let link: Partial<typeof transactions.$inferInsert> = {};
        const farGone: (typeof row)[] = [];
        let farMade: typeof row | null = null;
        if (relinks) {
          // A transfer files its category on whichever side is on budget, so
          // a row relinked from its off-budget side holds none of its own and
          // the old counterpart's is the one to carry over.
          const farCategoryBefore = farBefore
            ? isIncomeCategoryId(farBefore.categoryYnabId)
              ? farBefore.categoryYnabId
              : farBefore.categoryId
            : null;
          const category =
            categoryId !== undefined ? categoryId : (rowCategoryId ?? farCategoryBefore);
          if (row.isSplit && nextTarget !== null) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "A split cannot be a transfer. Delete it and enter the transfer on its own.",
            });
          }
          if (farBefore) {
            farGone.push(
              ...(await tx
                .update(transactions)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where(counterpartWhere(ctx, row.budgetId, farBefore.ynabId))
                .returning())
            );
          }
          if (nextPayee && nextTarget !== null) {
            const ends = await resolveTransferEnds(
              tx,
              row.budgetId,
              rest.accountId ?? row.accountId,
              { ...nextPayee, targetAccountId: nextTarget }
            );
            const farYnabId = crypto.randomUUID();
            farMade = await insertTransferFarSide(
              tx,
              ends,
              {
                amount: amount ?? Number(row.amount),
                date: rest.date ?? row.date,
                memo: rest.memo !== undefined ? rest.memo : row.memo,
                categoryId: category,
              },
              { near: row.ynabId, far: farYnabId }
            );
            link = {
              isTransfer: true,
              transferAccountId: ends.far.id,
              transferTransactionId: farYnabId,
              ...categoryColumns(transferCategoryId(ends.near, ends.far, category)),
            };
          } else {
            link = {
              isTransfer: false,
              transferAccountId: null,
              transferTransactionId: null,
              ...categoryColumns(category),
            };
          }
        }

        // Which side of a transfer carries the category follows from the two
        // accounts rather than from where the client put it, so a category
        // entered on the off-budget side lands on the on-budget one.
        const farAccountId = row.transferAccountId;
        let nearCategoryId = categoryId;
        let farCategoryId: typeof categoryId;
        if (!relinks && row.isTransfer && categoryId !== undefined && farAccountId !== null) {
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
            ...(nearCategoryId !== undefined ? categoryColumns(nearCategoryId) : {}),
            ...(amount != null ? { amount: String(amount) } : {}),
            ...link,
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
        let farAfter: (typeof row)[] = [...farGone, ...(farMade ? [farMade] : [])];
        if (farBefore && !relinks) {
          farAfter = await tx
            .update(transactions)
            .set({
              ...(rest.date !== undefined ? { date: rest.date } : {}),
              ...(amount != null ? { amount: String(-amount) } : {}),
              ...(farCategoryId !== undefined ? categoryColumns(farCategoryId) : {}),
              updatedAt: new Date(),
            })
            .where(counterpartWhere(ctx, row.budgetId, farBefore.ynabId))
            .returning();
        }

        await audit(tx, ctx.user.id, "transaction", {
          before: farBefore ? [row, farBefore] : [row],
          after: [updated!, ...farAfter],
        });
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
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.id, input.id),
              inArray(transactions.budgetId, ownedBudgetIds(ctx))
            )
          )
          .limit(1)
          .for("update");
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const farBefore = await loadCounterpart(tx, ctx, row);
        assertReconciledAcknowledged(
          row.cleared,
          farBefore?.cleared ?? null,
          input.acknowledgeReconciled,
          "Deleting"
        );

        const deleted = await tx
          .update(transactions)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(transactions.id, input.id),
              inArray(transactions.budgetId, ownedBudgetIds(ctx))
            )
          )
          .returning();

        // Both halves go together, or the account left holding one shows money
        // arriving from nowhere. A counterpart already gone leaves nothing to do.
        if (farBefore) {
          deleted.push(
            ...(await tx
              .update(transactions)
              .set({ deletedAt: new Date(), updatedAt: new Date() })
              .where(counterpartWhere(ctx, row.budgetId, farBefore.ynabId))
              .returning())
          );
        }

        await audit(tx, ctx.user.id, "transaction", {
          before: farBefore ? [row, farBefore] : [row],
          after: deleted,
        });
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
      await ctx.db.transaction(async (tx) => {
        const owned = and(
          eq(transactions.id, input.id),
          inArray(transactions.budgetId, ownedBudgetIds(ctx))
        );
        // Locked, so a reconcile racing this tick cannot reconcile the row
        // between the check below and the write.
        const [row] = await tx.select().from(transactions).where(owned).for("update");
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (row.cleared === "Reconciled") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This transaction was reconciled. Reconciling the account against a statement is what sets that, so it cannot be ticked back by hand.",
          });
        }

        const [updated] = await tx
          .update(transactions)
          .set({ cleared: input.cleared, updatedAt: new Date() })
          .where(owned)
          .returning();

        await audit(tx, ctx.user.id, "transaction", { before: [row], after: [updated!] });
      });
    }),
});

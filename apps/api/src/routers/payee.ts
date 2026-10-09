import { z } from "zod";
import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, budgetProcedure } from "../trpc";
import {
  payees,
  payeeRenameRules,
  transactions,
  subTransactions,
  scheduledTransactions,
  categories,
} from "@znab/db";
import { moneySchema, PAYEE_RENAME_OPERATORS, type PayeeRenameOperator } from "@znab/shared";
import { ownedBudgetIds, type AuthedContext } from "../lib/authz";
import { countOf } from "../lib/plural";
import type { Tx } from "../lib/tx";

/**
 * Reads one live payee of the budget, locked for the rest of the transaction,
 * the way `lockAccount` and `lockCategory` do. Owning the budget says nothing
 * about the payee id sent alongside it, so a payee from any other budget would
 * otherwise be renamed or deleted by whoever could guess its id; the lock keeps
 * the checks that follow true until the write lands.
 */
async function lockPayee(tx: Tx, ctx: AuthedContext, payeeId: number, budgetId: number) {
  const [payee] = await tx
    .select({ id: payees.id, name: payees.name, targetAccountId: payees.targetAccountId })
    .from(payees)
    .where(
      and(
        eq(payees.id, payeeId),
        eq(payees.budgetId, budgetId),
        isNull(payees.deletedAt),
        inArray(payees.budgetId, ownedBudgetIds(ctx))
      )
    )
    .for("update");
  if (!payee) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Payee not found" });
  }
  return payee;
}

/**
 * Transfer payees are the mirror image of an account, not free-standing names:
 * YNAB keeps "Transfer : Checking Account" in step with the account it points
 * at. Editing one from the payee side would desync the pair, so the account
 * stays the only place that may change it.
 */
function assertNotTransfer(
  payee: { name: string; targetAccountId: number | null },
  verb: string
) {
  if (payee.targetAccountId !== null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${payee.name}" is a transfer payee and cannot be ${verb}. Change the account instead.`,
    });
  }
}

export const payeeRouter = router({
  // The register's payee picker: live, enabled payees only, plus the autofill
  // defaults so choosing a payee can fill in category, amount and memo without
  // a second round trip.
  list: budgetProcedure
    .query(async ({ ctx, input }) => {
      return ctx.db.query.payees.findMany({
        where: and(
          eq(payees.budgetId, input.budgetId),
          isNull(payees.deletedAt),
          eq(payees.enabled, true)
        ),
        orderBy: (p, { asc }) => [asc(p.name)],
        columns: {
          id: true,
          name: true,
          autofillCategoryId: true,
          autofillAmount: true,
          autofillMemo: true,
          targetAccountId: true,
        },
      });
    }),

  // Everything the Manage Payees screen shows, for around a thousand payees a
  // budget. Usage totals come back from one grouped join and the rename rules
  // from one more query, stitched together here: a per-payee count query would
  // be a thousand round trips for a screen that opens once.
  listForManage: budgetProcedure
    .input(
      z.object({
        includeDisabled: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: payees.id,
          name: payees.name,
          enabled: payees.enabled,
          targetAccountId: payees.targetAccountId,
          autofillCategoryId: payees.autofillCategoryId,
          autofillAmount: payees.autofillAmount,
          autofillMemo: payees.autofillMemo,
          transactionCount: count(transactions.id),
          lastUsed: sql<string | null>`max(${transactions.date})`,
        })
        .from(payees)
        // The deleted-transaction filter rides on the join, not the WHERE: on an
        // outer join a WHERE clause naming the right-hand table would drop every
        // payee that has no transactions at all.
        .leftJoin(
          transactions,
          and(eq(transactions.payeeId, payees.id), isNull(transactions.deletedAt))
        )
        .where(
          and(
            eq(payees.budgetId, input.budgetId),
            isNull(payees.deletedAt),
            input.includeDisabled ? undefined : eq(payees.enabled, true)
          )
        )
        .groupBy(payees.id)
        .orderBy(asc(payees.name));

      const ruleRows = await ctx.db
        .select({
          id: payeeRenameRules.id,
          payeeId: payeeRenameRules.payeeId,
          operator: payeeRenameRules.operator,
          operand: payeeRenameRules.operand,
        })
        .from(payeeRenameRules)
        .where(
          and(
            eq(payeeRenameRules.budgetId, input.budgetId),
            isNull(payeeRenameRules.deletedAt)
          )
        )
        .orderBy(asc(payeeRenameRules.id));

      type ManageRule = { id: number; operator: PayeeRenameOperator; operand: string };
      const rulesByPayee = new Map<number, ManageRule[]>();
      for (const rule of ruleRows) {
        const forPayee = rulesByPayee.get(rule.payeeId) ?? [];
        forPayee.push({
          id: rule.id,
          operator: rule.operator as PayeeRenameOperator,
          operand: rule.operand,
        });
        rulesByPayee.set(rule.payeeId, forPayee);
      }

      // Postgres counts are bigints, which the driver hands over as strings.
      return rows.map((row) => ({
        ...row,
        transactionCount: Number(row.transactionCount),
        renameRules: rulesByPayee.get(row.id) ?? [],
      }));
    }),

  // Renaming is the common repair on an imported payee list (a typo, a bank
  // shouting in capitals). A name already in use is refused rather than allowed
  // to create a second payee nobody can tell apart, since what that user wants
  // is a merge.
  rename: budgetProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        // The column is unbounded text, so the ceiling has to come from here.
        name: z.string().max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const name = input.name.trim();
      if (!name) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payee name cannot be empty" });
      }

      return ctx.db.transaction(async (tx) => {
        const payee = await lockPayee(tx, ctx, input.id, input.budgetId);
        assertNotTransfer(payee, "renamed");

        const clash = await tx.query.payees.findFirst({
          where: and(
            eq(payees.budgetId, input.budgetId),
            isNull(payees.deletedAt),
            ne(payees.id, input.id),
            // Trimmed on both sides: the imported list carries names stored
            // with trailing spaces ("Hilton "), and comparing those against a
            // trimmed input would wave through the exact duplicate this check
            // exists to stop.
            sql`lower(trim(${payees.name})) = ${name.toLowerCase()}`
          ),
          columns: { id: true, name: true },
        });
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${clash.name}" already exists. Merge the two payees instead.`,
          });
        }

        const [updated] = await tx
          .update(payees)
          .set({ name, updatedAt: new Date() })
          .where(and(eq(payees.id, payee.id), eq(payees.budgetId, input.budgetId)))
          .returning({ id: payees.id, name: payees.name });

        return updated!;
      });
    }),

  // Folding duplicates into one payee. Every table that names a payee is
  // repointed inside a single transaction, so a failure part way through cannot
  // leave half the history on a payee the other half has stopped using. Rows
  // that are themselves soft deleted move too, so nothing is left pointing at a
  // payee that has been merged away.
  merge: budgetProcedure
    .input(
      z.object({
        // Capped well under Postgres' bind parameter limit: a longer list
        // fails inside the driver, which reports it by echoing the whole query.
        sourceIds: z.array(z.number().int().positive()).min(1).max(500),
        targetId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sourceIds = [...new Set(input.sourceIds)];
      if (sourceIds.includes(input.targetId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A payee cannot be merged into itself",
        });
      }

      return ctx.db.transaction(async (tx) => {
        const involved = await tx
          .select({
            id: payees.id,
            name: payees.name,
            targetAccountId: payees.targetAccountId,
          })
          .from(payees)
          .where(
            and(
              eq(payees.budgetId, input.budgetId),
              isNull(payees.deletedAt),
              inArray(payees.id, [input.targetId, ...sourceIds])
            )
          )
          .for("update");

        const byId = new Map(involved.map((p) => [p.id, p]));
        for (const id of [input.targetId, ...sourceIds]) {
          const payee = byId.get(id);
          if (!payee) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Payee ${id} not found` });
          }
          assertNotTransfer(payee, "merged");
        }

        const movedTransactions = await tx
          .update(transactions)
          .set({ payeeId: input.targetId, updatedAt: new Date() })
          .where(
            and(
              eq(transactions.budgetId, input.budgetId),
              inArray(transactions.payeeId, sourceIds)
            )
          )
          .returning({ id: transactions.id, deletedAt: transactions.deletedAt });

        // sub_transactions carries no budget id of its own, so it is scoped by
        // the source ids, which the select above proved belong to this budget.
        await tx
          .update(subTransactions)
          .set({ payeeId: input.targetId, updatedAt: new Date() })
          .where(inArray(subTransactions.payeeId, sourceIds));

        await tx
          .update(scheduledTransactions)
          .set({ payeeId: input.targetId, updatedAt: new Date() })
          .where(
            and(
              eq(scheduledTransactions.budgetId, input.budgetId),
              inArray(scheduledTransactions.payeeId, sourceIds)
            )
          );

        const movedRenameRules = await tx
          .update(payeeRenameRules)
          .set({ payeeId: input.targetId, updatedAt: new Date() })
          .where(
            and(
              eq(payeeRenameRules.budgetId, input.budgetId),
              inArray(payeeRenameRules.payeeId, sourceIds)
            )
          )
          .returning({ id: payeeRenameRules.id, deletedAt: payeeRenameRules.deletedAt });

        await tx
          .update(payees)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(payees.budgetId, input.budgetId), inArray(payees.id, sourceIds)));

        // Every row moved, deleted ones included, but the figures reported
        // back count only the visible rows. The manage screen previews the move
        // from its own live counts, and a total that included rows the user
        // cannot see would read as though the merge touched more than was
        // asked of it.
        return {
          movedTransactions: movedTransactions.filter((t) => t.deletedAt === null).length,
          movedRenameRules: movedRenameRules.filter((r) => r.deletedAt === null).length,
        };
      });
    }),

  // Deleting is only ever offered for a payee nothing points at. Soft deleting
  // one that is still in use would leave its transactions showing a blank payee
  // with no way back, which is worse than refusing: merging is the operation
  // that keeps the history.
  delete: budgetProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const payee = await lockPayee(tx, ctx, input.id, input.budgetId);
        assertNotTransfer(payee, "deleted");

        const [txnRefs, subRefs, scheduledRefs] = await Promise.all([
          tx
            .select({ value: count() })
            .from(transactions)
            .where(and(eq(transactions.payeeId, payee.id), isNull(transactions.deletedAt))),
          tx
            .select({ value: count() })
            .from(subTransactions)
            .where(
              and(eq(subTransactions.payeeId, payee.id), isNull(subTransactions.deletedAt))
            ),
          tx
            .select({ value: count() })
            .from(scheduledTransactions)
            .where(
              and(
                eq(scheduledTransactions.payeeId, payee.id),
                isNull(scheduledTransactions.deletedAt)
              )
            ),
        ]);

        const references =
          Number(txnRefs[0]!.value) +
          Number(subRefs[0]!.value) +
          Number(scheduledRefs[0]!.value);
        if (references > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${payee.name}" is still used by ${countOf(references, "transaction")}. Merge it into another payee instead.`,
          });
        }

        // The rename rules go with the payee and are deliberately not part of
        // the reference count above: a rule is the payee's own configuration
        // rather than history the way a transaction is. Left behind it would
        // be invisible, since the manage screen only hangs rules off live
        // payees, while still holding its operand against every other payee
        // through the clash check in `addRenameRule`.
        await tx
          .update(payeeRenameRules)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(payeeRenameRules.payeeId, payee.id),
              eq(payeeRenameRules.budgetId, input.budgetId),
              isNull(payeeRenameRules.deletedAt)
            )
          );

        const [deleted] = await tx
          .update(payees)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(payees.id, payee.id), eq(payees.budgetId, input.budgetId)))
          .returning({ id: payees.id });

        return deleted!;
      });
    }),

  // The defaults a payee fills in on a new transaction. All three fields are
  // sent together and each is nullable, so clearing one is an ordinary save
  // rather than an operation of its own.
  setAutofill: budgetProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        categoryId: z.number().int().positive().nullable(),
        amount: moneySchema.nullable(),
        memo: z.string().max(500).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const payee = await lockPayee(tx, ctx, input.id, input.budgetId);

        // A category from another budget would autofill transactions with an
        // envelope this budget cannot even show.
        if (input.categoryId !== null) {
          const category = await tx.query.categories.findFirst({
            where: and(
              eq(categories.id, input.categoryId),
              eq(categories.budgetId, input.budgetId),
              isNull(categories.deletedAt)
            ),
            columns: { id: true },
          });
          if (!category) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
          }
        }

        const [updated] = await tx
          .update(payees)
          .set({
            autofillCategoryId: input.categoryId,
            // Money crosses the drizzle boundary as a string.
            autofillAmount: input.amount === null ? null : String(input.amount),
            autofillMemo: input.memo?.trim() || null,
            updatedAt: new Date(),
          })
          .where(and(eq(payees.id, payee.id), eq(payees.budgetId, input.budgetId)))
          .returning({
            id: payees.id,
            autofillCategoryId: payees.autofillCategoryId,
            autofillAmount: payees.autofillAmount,
            autofillMemo: payees.autofillMemo,
          });

        return updated!;
      });
    }),

  // A rename rule teaches the importer that one bank string means one payee.
  // Two rules over the same text would make which payee wins depend on row
  // order, so the second one is refused.
  addRenameRule: budgetProcedure
    .input(
      z.object({
        payeeId: z.number().int().positive(),
        operator: z.enum(PAYEE_RENAME_OPERATORS),
        operand: z.string().max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const operand = input.operand.trim();
      if (!operand) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Rule text cannot be empty" });
      }

      return ctx.db.transaction(async (tx) => {
        const payee = await lockPayee(tx, ctx, input.payeeId, input.budgetId);

        // Joined to payees so only a rule on a live payee can refuse this one.
        // A rule stranded on a deleted payee has no screen that can clear it,
        // so counting one would lock its operand away from the budget for good.
        const [clash] = await tx
          .select({ id: payeeRenameRules.id })
          .from(payeeRenameRules)
          .innerJoin(payees, eq(payees.id, payeeRenameRules.payeeId))
          .where(
            and(
              eq(payeeRenameRules.budgetId, input.budgetId),
              isNull(payeeRenameRules.deletedAt),
              isNull(payees.deletedAt),
              eq(payeeRenameRules.operator, input.operator),
              // Trimmed to match how the matcher compares, which ignores
              // padding on both sides. One imported operand is stored with a
              // leading tab, so an untrimmed check here would accept a second
              // rule that behaves identically to the first.
              sql`lower(trim(${payeeRenameRules.operand})) = ${operand.toLowerCase()}`
            )
          )
          .limit(1);
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A rule for "${operand}" already exists`,
          });
        }

        // YNAB 4 calls these entities payeeStringCondition, so a rule authored
        // here carries the same id shape as an imported one.
        const [created] = await tx
          .insert(payeeRenameRules)
          .values({
            ynabId: `PayeeStringCondition/${crypto.randomUUID()}`,
            budgetId: input.budgetId,
            payeeId: payee.id,
            operator: input.operator,
            operand,
          })
          .returning({
            id: payeeRenameRules.id,
            payeeId: payeeRenameRules.payeeId,
            operator: payeeRenameRules.operator,
            operand: payeeRenameRules.operand,
          });

        return created!;
      });
    }),

  // Soft delete, like everything else here, so a rule dropped by accident is
  // still on disk. The budget scope rides on the UPDATE itself, since a rule id
  // on its own says nothing about who owns it.
  deleteRenameRule: budgetProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .update(payeeRenameRules)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(payeeRenameRules.id, input.id),
            eq(payeeRenameRules.budgetId, input.budgetId),
            isNull(payeeRenameRules.deletedAt)
          )
        )
        .returning({ id: payeeRenameRules.id });

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rename rule not found" });
      }
      return deleted;
    }),
});

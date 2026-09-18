import { z } from "zod";
import { eq, and, count, isNull, inArray, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { db } from "@znab/db";
import {
  accounts,
  categories,
  categoryGroups,
  payees,
  scheduledTransactions,
  transactions,
} from "@znab/db";
import { ACCOUNT_TYPES, createAccountSchema, reconcileAccountSchema } from "@znab/shared";
import { assertBudgetAccess, ownedBudgetIds, type AuthedContext } from "../lib/authz";
import {
  accountClass,
  startingBalanceCategory,
  PRE_YNAB_DEBT_GROUP_NAME,
  PRE_YNAB_DEBT_GROUP_YNAB_ID,
  STARTING_BALANCE_PAYEE_NAME,
} from "../lib/account";
import {
  balanceAdjustment,
  reconcileDifference,
  RECONCILE_MEMO,
  RECONCILE_PAYEE_NAME,
} from "../lib/reconcile";
import { transferPayeeName, transferPayeeYnabId } from "../lib/transfer";

/** The handle inside `db.transaction`, for the helpers the writes below share. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The live rows an account holds. Three of the writes below turn on it: the two
 * settings the budget engine reads as they stand today cannot be flipped under
 * existing history, and an account that has history is closed rather than
 * deleted.
 */
async function liveTransactionCount(tx: Tx, accountId: number): Promise<number> {
  const [used] = await tx
    .select({ value: count() })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)));
  return Number(used!.value);
}

/** Reads one live account of the budget, locked for the rest of the transaction. */
async function lockAccount(
  tx: Tx,
  ctx: AuthedContext,
  accountId: number,
  budgetId: number
) {
  const [account] = await tx
    .select({
      id: accounts.id,
      name: accounts.name,
      accountType: accounts.accountType,
      onBudget: accounts.onBudget,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.budgetId, budgetId),
        isNull(accounts.deletedAt),
        inArray(accounts.budgetId, ownedBudgetIds(ctx))
      )
    )
    .for("update");
  if (!account) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  }
  return account;
}

/** One page row from the window query: the id and its account-wide balance. */
type PageRow = { id: number; runningBalance: string };
type TotalsRow = {
  balance: string;
  clearedBalance: string;
  unclearedBalance: string;
  count: number;
  unclearedCount: number;
  clearedCount: number;
  reconciledCount: number;
};

export const accountRouter = router({
  // All accounts for a budget
  list: protectedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.query.accounts.findMany({
        where: and(
          eq(accounts.budgetId, input.budgetId),
          isNull(accounts.deletedAt)
        ),
        orderBy: (a, { asc }) => [asc(a.sortOrder)],
      });
    }),

  // One page of an account's register, newest activity first.
  //
  // The running balance is the account's true balance as of each transaction,
  // so it is computed by a window over the account's whole history and the
  // filters and paging are applied outside that window — a filtered or partial
  // view still shows real balances. `balance` is the account's working balance
  // and is independent of the page, so the header stays right however far back
  // the register is scrolled.
  transactions: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        accountId: z.number().int().positive(),
        cleared: z.enum(["all", "Uncleared", "Cleared", "Reconciled"]).default("all"),
        q: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(200),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      const clearedFilter =
        input.cleared === "all" ? sql`TRUE` : sql`x.cleared = ${input.cleared}`;
      const searchFilter = input.q
        ? sql`x.memo ILIKE ${`%${input.q}%`}`
        : sql`TRUE`;

      // Fetch one extra row to learn whether older transactions remain.
      const pageRows = (await ctx.db.execute(sql`
        SELECT x.id, x.running_balance AS "runningBalance"
        FROM (
          SELECT
            t.id, t.cleared, t.memo, t.date, t.created_at,
            SUM(t.amount) OVER (ORDER BY t.date, t.created_at, t.id) AS running_balance
          FROM transactions t
          WHERE t.budget_id = ${input.budgetId}
            AND t.account_id = ${input.accountId}
            AND t.deleted_at IS NULL
        ) x
        WHERE ${clearedFilter} AND ${searchFilter}
        ORDER BY x.date DESC, x.created_at DESC, x.id DESC
        LIMIT ${input.limit + 1} OFFSET ${input.offset}
      `)) as unknown as PageRow[];

      const totals = (await ctx.db.execute(sql`
        SELECT
          COALESCE(SUM(amount), 0) AS balance,
          COALESCE(SUM(amount) FILTER (
            WHERE cleared IN ('Cleared', 'Reconciled')
          ), 0) AS "clearedBalance",
          COALESCE(SUM(amount) FILTER (WHERE cleared = 'Uncleared'), 0) AS "unclearedBalance",
          COUNT(*)::int AS count,
          -- What the filter control puts beside each choice. They come off the
          -- scan the balances above already pay for, rather than a query each.
          COUNT(*) FILTER (WHERE cleared = 'Uncleared')::int AS "unclearedCount",
          COUNT(*) FILTER (WHERE cleared = 'Cleared')::int AS "clearedCount",
          COUNT(*) FILTER (WHERE cleared = 'Reconciled')::int AS "reconciledCount"
        FROM transactions
        WHERE budget_id = ${input.budgetId}
          AND account_id = ${input.accountId}
          AND deleted_at IS NULL
      `)) as unknown as TotalsRow[];

      const hasMore = pageRows.length > input.limit;
      const visible = hasMore ? pageRows.slice(0, input.limit) : pageRows;
      const balanceById = new Map(
        visible.map((r) => [r.id, parseFloat(r.runningBalance)])
      );

      const rows = visible.length
        ? await ctx.db.query.transactions.findMany({
            where: inArray(
              transactions.id,
              visible.map((r) => r.id)
            ),
            with: {
              payee: true,
              category: true,
              subTransactions: { with: { category: true } },
            },
          })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));

      // The far side of a transfer lives in another account, so it is never on
      // this page, and editing or deleting either side needs to know whether
      // the other one has been reconciled: the two accounts are reconciled
      // against their own statements, so one side commonly is while the other
      // is not. Without this the register would open such a row as ordinary,
      // then have the write refused with no way to answer for it.
      const pairIds = rows
        .filter((r) => r.isTransfer && r.transferTransactionId)
        .map((r) => r.transferTransactionId!);
      const counterparts = pairIds.length
        ? await ctx.db
            .select({ ynabId: transactions.ynabId, cleared: transactions.cleared })
            .from(transactions)
            .where(
              and(
                eq(transactions.budgetId, input.budgetId),
                inArray(transactions.ynabId, pairIds),
                isNull(transactions.deletedAt)
              )
            )
        : [];
      const clearedByYnabId = new Map(counterparts.map((c) => [c.ynabId, c.cleared]));

      // `visible` is newest-first for paging; the register reads oldest-first.
      const page = visible
        .slice()
        .reverse()
        .flatMap((r) => {
          const row = byId.get(r.id);
          return row
            ? [
                {
                  ...row,
                  runningBalance: balanceById.get(r.id) ?? 0,
                  counterpartCleared: row.transferTransactionId
                    ? clearedByYnabId.get(row.transferTransactionId) ?? null
                    : null,
                },
              ]
            : [];
        });

      // The three figures YNAB 4 shows above a register: what the bank has
      // agreed to (cleared), what it has not seen yet (uncleared), and the two
      // together, which is the account's working balance.
      return {
        transactions: page,
        balance: parseFloat(totals[0]?.balance ?? "0"),
        clearedBalance: parseFloat(totals[0]?.clearedBalance ?? "0"),
        unclearedBalance: parseFloat(totals[0]?.unclearedBalance ?? "0"),
        total: totals[0]?.count ?? 0,
        // Counted over the whole account, like the balances above, so the
        // filter keeps saying what each choice holds while one is in force.
        counts: {
          all: totals[0]?.count ?? 0,
          Uncleared: totals[0]?.unclearedCount ?? 0,
          Cleared: totals[0]?.clearedCount ?? 0,
          Reconciled: totals[0]?.reconciledCount ?? 0,
        },
        hasMore,
      };
    }),

  // A new account, together with what it already holds. YNAB 4 records an
  // opening balance as an ordinary transaction rather than as a column on the
  // account, so the register shows where the money came from and the budget
  // counts it like any other row.
  create: protectedProcedure
    .input(
      createAccountSchema.extend({
        budgetId: z.number().int().positive(),
        startingBalance: z.number().optional(),
        startingBalanceDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      // An opening balance dated ahead of today would be income the budget
      // cannot reach yet, and on a budget with nothing else in it the month
      // engine starts at the earliest row it can find, so every month before
      // that date reads as empty. There is no account that opened tomorrow.
      if (
        input.startingBalanceDate &&
        input.startingBalanceDate > new Date().toISOString().slice(0, 10)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An account cannot open with a balance dated in the future.",
        });
      }

      const name = input.name.trim();
      if (!name) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Account name cannot be empty" });
      }

      // YNAB 4 names an account with a bare uuid, so nothing imported carries
      // this shape. Prefixed the way every other authored id is, which keeps an
      // account made here telling about where it came from.
      const ynabId = `Account/${crypto.randomUUID()}`;

      return ctx.db.transaction(async (tx) => {
        const [top] = await tx
          .select({ max: sql<number | null>`MAX(${accounts.sortOrder})` })
          .from(accounts)
          .where(and(eq(accounts.budgetId, input.budgetId), isNull(accounts.deletedAt)));

        const [account] = await tx
          .insert(accounts)
          .values({
            ynabId,
            budgetId: input.budgetId,
            name,
            accountType: input.accountType,
            onBudget: input.onBudget,
            hidden: false,
            // The sidebar orders by this, so a new account joins the end.
            sortOrder: Number(top?.max ?? -1) + 1,
            note: input.note?.trim() || null,
          })
          .returning();

        // Every account is supposed to have a payee standing in for it, so
        // that money can be moved to it from somewhere else. Minted here
        // rather than on the first transfer, so that "every account has one"
        // holds by construction, and enabled because a new account is open.
        await tx.insert(payees).values({
          ynabId: transferPayeeYnabId(ynabId),
          budgetId: input.budgetId,
          name: transferPayeeName(name),
          targetAccountId: account!.id,
          enabled: true,
        });

        const amount = input.startingBalance ?? 0;
        if (amount !== 0) {
          const opening = startingBalanceCategory(account!, ynabId);

          // An on-budget account opening in the red owes money the budget
          // never saw, which YNAB 4 files under a category of the account's
          // own inside a system group. That category is new by construction,
          // since it hangs off an id minted moments ago; the group is shared,
          // and the imported budgets carry it already while one started here
          // does not, so the group is resolved rather than simply made.
          let categoryId: number | null = null;
          if (opening.preYnabDebt) {
            const group = await tx.query.categoryGroups.findFirst({
              where: and(
                eq(categoryGroups.budgetId, input.budgetId),
                eq(categoryGroups.ynabId, PRE_YNAB_DEBT_GROUP_YNAB_ID),
                isNull(categoryGroups.deletedAt)
              ),
              columns: { id: true },
            });
            let groupId = group?.id;
            if (!groupId) {
              // Two accounts opening the first debt in a budget at once would
              // both read no group and both insert one, and the second would
              // come back as a bare unique violation rather than anything a
              // reader could act on. Letting the constraint decide, then
              // reading back what won, costs a query only the first time.
              const [created] = await tx
                .insert(categoryGroups)
                .values({
                  ynabId: PRE_YNAB_DEBT_GROUP_YNAB_ID,
                  budgetId: input.budgetId,
                  name: PRE_YNAB_DEBT_GROUP_NAME,
                  isSystem: true,
                })
                .onConflictDoNothing()
                .returning({ id: categoryGroups.id });
              groupId =
                created?.id ??
                (await tx.query.categoryGroups.findFirst({
                  where: and(
                    eq(categoryGroups.budgetId, input.budgetId),
                    eq(categoryGroups.ynabId, PRE_YNAB_DEBT_GROUP_YNAB_ID)
                  ),
                  columns: { id: true },
                }))!.id;
            }

            const [category] = await tx
              .insert(categories)
              .values({
                ynabId: opening.categoryYnabId!,
                budgetId: input.budgetId,
                groupId,
                name,
              })
              .returning({ id: categories.id });
            categoryId = category!.id;
          }

          // Matched trimmed and case-insensitively, the way reconcile matches
          // its own payee, so a stored name with stray whitespace is reused
          // rather than doubled. A new one is disabled as the imported one is:
          // it is the account's own bookkeeping rather than a payee anybody
          // enters a transaction against, so it stays out of the picker.
          const existing = await tx.query.payees.findFirst({
            where: and(
              eq(payees.budgetId, input.budgetId),
              isNull(payees.deletedAt),
              sql`lower(trim(${payees.name})) = ${STARTING_BALANCE_PAYEE_NAME.toLowerCase()}`
            ),
            columns: { id: true },
          });
          let payeeId = existing?.id;
          if (!payeeId) {
            const [created] = await tx
              .insert(payees)
              .values({
                ynabId: `Payee/${crypto.randomUUID()}`,
                budgetId: input.budgetId,
                name: STARTING_BALANCE_PAYEE_NAME,
                enabled: false,
              })
              .returning({ id: payees.id });
            payeeId = created!.id;
          }

          await tx.insert(transactions).values({
            ynabId: crypto.randomUUID(),
            budgetId: input.budgetId,
            accountId: account!.id,
            payeeId,
            // Both, the way the importer stores them: the id points at the
            // category row and the ynab id says which envelope it stands for.
            categoryId,
            categoryYnabId: opening.categoryYnabId,
            amount: String(amount),
            date: input.startingBalanceDate ?? new Date().toISOString().slice(0, 10),
            // The money is already there, so the bank has agreed to it.
            cleared: "Cleared",
            accepted: true,
          });
        }

        return account!;
      });
    }),

  // Renaming an account and changing what it is. Absent keys are left alone,
  // so a form can send only what the user touched.
  update: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        accountId: z.number().int().positive(),
        name: z.string().max(200).optional(),
        accountType: z.enum(ACCOUNT_TYPES).optional(),
        note: z.string().max(1000).optional(),
        onBudget: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      const name = input.name?.trim();
      if (input.name !== undefined && !name) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Account name cannot be empty" });
      }

      return ctx.db.transaction(async (tx) => {
        const account = await lockAccount(tx, ctx, input.accountId, input.budgetId);

        // `on_budget`, and whether the account type counts as credit or cash,
        // are read by the budget engine as they stand today: every month it
        // has ever shown is computed from the account as it is now, with no
        // point-in-time snapshot behind it. Flipping either under existing
        // rows would silently rewrite years of arithmetic, so it is refused
        // rather than warned about. An account with nothing in it has no
        // history to rewrite, which is what lets a fresh mistake be corrected.
        const crossesSplit =
          input.accountType !== undefined &&
          accountClass(input.accountType) !== accountClass(account.accountType);
        const flipsOnBudget =
          input.onBudget !== undefined && input.onBudget !== account.onBudget;
        const live =
          crossesSplit || flipsOnBudget ? await liveTransactionCount(tx, account.id) : 0;
        const rows = `${live} transaction${live === 1 ? "" : "s"}`;

        if (flipsOnBudget && live > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${account.name}" has ${rows}. Moving it ${
              input.onBudget ? "on" : "off"
            } budget would rewrite the activity and To be Budgeted of every month it appears in. Create a new account instead.`,
          });
        }
        if (crossesSplit && live > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${account.name}" is a ${accountClass(
              account.accountType
            )} account with ${rows}. Making it a ${accountClass(
              input.accountType!
            )} account would rewrite how every past month's overspending was funded. Create a new account instead.`,
          });
        }

        // payee.ts refuses to rename a transfer payee, telling the user to
        // change the account instead. This is where that promise is kept.
        if (name !== undefined && name !== account.name) {
          await tx
            .update(payees)
            .set({ name: transferPayeeName(name), updatedAt: new Date() })
            .where(
              and(
                eq(payees.targetAccountId, account.id),
                isNull(payees.deletedAt),
                inArray(payees.budgetId, ownedBudgetIds(ctx))
              )
            );
        }

        const [updated] = await tx
          .update(accounts)
          .set({
            ...(name !== undefined ? { name } : {}),
            ...(input.accountType !== undefined ? { accountType: input.accountType } : {}),
            ...(input.onBudget !== undefined ? { onBudget: input.onBudget } : {}),
            // An emptied note is a cleared one, not an empty string.
            ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(eq(accounts.id, account.id), inArray(accounts.budgetId, ownedBudgetIds(ctx)))
          )
          .returning();

        return updated!;
      });
    }),

  // Closing an account, and reopening it. `hidden` is the only thing that
  // moves: the budget filters on `deleted_at` and never looks at `hidden`, so
  // a closed account's history still counts in every month it belongs to,
  // which is the whole of why YNAB 4 closes accounts instead of deleting them.
  setHidden: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        accountId: z.number().int().positive(),
        hidden: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        const account = await lockAccount(tx, ctx, input.accountId, input.budgetId);

        // The payee standing in for the account is enabled exactly when the
        // account is open, which is what takes a closed account out of the
        // register's payee picker and puts a reopened one back into it.
        await tx
          .update(payees)
          .set({ enabled: !input.hidden, updatedAt: new Date() })
          .where(
            and(
              eq(payees.targetAccountId, account.id),
              isNull(payees.deletedAt),
              inArray(payees.budgetId, ownedBudgetIds(ctx))
            )
          );

        const [updated] = await tx
          .update(accounts)
          .set({ hidden: input.hidden, updatedAt: new Date() })
          .where(
            and(eq(accounts.id, account.id), inArray(accounts.budgetId, ownedBudgetIds(ctx)))
          )
          .returning();

        return updated!;
      });
    }),

  // The sidebar's order, sent whole. A partial order would leave the accounts
  // it left out sitting wherever they were, which is how two of them come to
  // claim the same place, so anything but the complete set is refused.
  reorder: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        accountIds: z.array(z.number().int().positive()).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        const live = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.budgetId, input.budgetId),
              isNull(accounts.deletedAt),
              inArray(accounts.budgetId, ownedBudgetIds(ctx))
            )
          )
          .for("update");

        const liveIds = new Set(live.map((a) => a.id));
        const sent = new Set(input.accountIds);
        if (
          sent.size !== input.accountIds.length ||
          sent.size !== liveIds.size ||
          input.accountIds.some((id) => !liveIds.has(id))
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `The new order has to name each of this budget's ${liveIds.size} accounts exactly once. Reload the sidebar and try again.`,
          });
        }

        // One statement an account, which is a few dozen for even the largest
        // imported budget, all inside the one transaction so that no reader
        // ever sees half an order.
        for (const [index, id] of input.accountIds.entries()) {
          await tx
            .update(accounts)
            .set({ sortOrder: index, updatedAt: new Date() })
            .where(and(eq(accounts.id, id), inArray(accounts.budgetId, ownedBudgetIds(ctx))));
        }

        return { reordered: input.accountIds.length };
      });
    }),

  // Deleting is only ever offered for an account that never held anything, so
  // that one entered by mistake can be taken back. An account with history is
  // closed instead, which is what keeps its months intact.
  delete: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        accountId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        const account = await lockAccount(tx, ctx, input.accountId, input.budgetId);

        const live = await liveTransactionCount(tx, account.id);
        if (live > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${account.name}" still has ${live} transaction${
              live === 1 ? "" : "s"
            }. Close the account instead, which keeps its history in every month it belongs to.`,
          });
        }

        // A schedule outlives the account it pays from, and entering one after
        // the account had gone would either write into a deleted account or
        // refuse every sweep of the budget from then on.
        const [scheduled] = await tx
          .select({ value: count() })
          .from(scheduledTransactions)
          .where(
            and(
              eq(scheduledTransactions.accountId, account.id),
              isNull(scheduledTransactions.deletedAt)
            )
          );
        const stillScheduled = Number(scheduled!.value);
        if (stillScheduled > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${account.name}" still has ${stillScheduled} scheduled transaction${
              stillScheduled === 1 ? "" : "s"
            }. Delete those first, or close the account instead.`,
          });
        }

        // The payee standing in for the account goes with it: left behind, it
        // would offer a transfer to an account that is no longer there.
        await tx
          .update(payees)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(payees.targetAccountId, account.id),
              isNull(payees.deletedAt),
              inArray(payees.budgetId, ownedBudgetIds(ctx))
            )
          );

        const [deleted] = await tx
          .update(accounts)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(eq(accounts.id, account.id), inArray(accounts.budgetId, ownedBudgetIds(ctx)))
          )
          .returning({ id: accounts.id });

        return deleted!;
      });
    }),

  // Reconciling against a statement. The user asserts a balance and a closing
  // date, and every transaction the register has cleared up to that date
  // becomes Reconciled: the statement has vouched for it, so it is no longer
  // in question. Anything still outstanding is closed by a balance adjustment,
  // which is only written on the user's say-so.
  //
  // `lastReconciledBalance` records what was asserted, not anything derived
  // from the rows: it is the claim the account was balanced against, and the
  // rows can move afterwards without making that claim untrue.
  reconcile: protectedProcedure
    .input(
      reconcileAccountSchema.extend({
        budgetId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        // The account decides whether the adjustment is income to the budget,
        // so it is read inside the same transaction that writes against it,
        // and scoped to the caller's own budgets rather than to the budget id
        // they sent. Locked for the rest of the transaction: two reconciliations
        // racing on one account would each read the balance before either wrote,
        // and each enter an adjustment for the same difference.
        const [account] = await tx
          .select({
            id: accounts.id,
            name: accounts.name,
            onBudget: accounts.onBudget,
            lastReconciledDate: accounts.lastReconciledDate,
          })
          .from(accounts)
          .where(
            and(
              eq(accounts.id, input.accountId),
              eq(accounts.budgetId, input.budgetId),
              isNull(accounts.deletedAt),
              inArray(accounts.budgetId, ownedBudgetIds(ctx))
            )
          )
          .for("update");
        if (!account) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
        }

        // A statement cannot close in the future, and letting one say it did
        // would be hard to undo: the guard below would then refuse every
        // correctly dated reconciliation until that date came round.
        if (input.statementDate > new Date().toISOString().slice(0, 10)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A statement cannot close in the future.",
          });
        }

        // Reconciling runs forwards. Against an older statement the sweep
        // below would leave rows already reconciled past the date about to be
        // recorded, so the account would claim less reconciled history than it
        // has; across the 18,010 imported reconciled rows not one sits after
        // its account's date, and that is worth keeping true.
        if (
          account.lastReconciledDate &&
          input.statementDate < account.lastReconciledDate
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${account.name}" was already reconciled up to ${account.lastReconciledDate}. Reconcile against a statement that closes on or after that date.`,
          });
        }

        // What the bank has agreed to as of the statement's closing date.
        // Later transactions are real, but this statement says nothing about
        // them, so they are none of its business.
        const [cleared] = await tx
          .select({ balance: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
          .from(transactions)
          .where(
            and(
              eq(transactions.accountId, account.id),
              inArray(transactions.cleared, ["Cleared", "Reconciled"]),
              lte(transactions.date, input.statementDate),
              isNull(transactions.deletedAt)
            )
          );
        const clearedBalance = parseFloat(cleared?.balance ?? "0");
        const difference = reconcileDifference(input.statementBalance, clearedBalance);

        if (difference !== 0 && !input.adjustment) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${account.name}" is off the statement by ${difference.toFixed(2)}. Tick the rest of the transactions, or reconcile again with a balance adjustment.`,
          });
        }

        let adjustmentAmount: number | null = null;
        if (difference !== 0) {
          const adjustment = balanceAdjustment(account, difference);

          // Every imported budget already has this payee; one started here
          // does not, so it is made on demand. Matched the way the payee
          // screen matches a rename, trimmed and case-insensitively, so a
          // stored name with stray whitespace is reused rather than doubled.
          const existing = await tx.query.payees.findFirst({
            where: and(
              eq(payees.budgetId, input.budgetId),
              isNull(payees.deletedAt),
              sql`lower(trim(${payees.name})) = ${RECONCILE_PAYEE_NAME.toLowerCase()}`
            ),
            columns: { id: true },
          });
          let payeeId = existing?.id;
          if (!payeeId) {
            const [created] = await tx
              .insert(payees)
              .values({
                ynabId: `Payee/${crypto.randomUUID()}`,
                budgetId: input.budgetId,
                name: RECONCILE_PAYEE_NAME,
              })
              .returning({ id: payees.id });
            payeeId = created!.id;
          }

          await tx.insert(transactions).values({
            ynabId: crypto.randomUUID(),
            budgetId: input.budgetId,
            accountId: account.id,
            payeeId,
            categoryYnabId: adjustment.categoryYnabId,
            amount: String(adjustment.amount),
            date: input.statementDate,
            // Reconciled as written: it is the row that makes the statement
            // true, which also keeps it out of the sweep below and so out of
            // the count of rows the user's own ticking reconciled.
            cleared: "Reconciled",
            accepted: true,
            memo: RECONCILE_MEMO,
          });
          adjustmentAmount = adjustment.amount;
        }

        const swept = await tx
          .update(transactions)
          .set({ cleared: "Reconciled", updatedAt: new Date() })
          .where(
            and(
              eq(transactions.accountId, account.id),
              eq(transactions.cleared, "Cleared"),
              lte(transactions.date, input.statementDate),
              isNull(transactions.deletedAt),
              inArray(transactions.budgetId, ownedBudgetIds(ctx))
            )
          )
          .returning({ id: transactions.id });

        await tx
          .update(accounts)
          .set({
            lastReconciledBalance: String(input.statementBalance),
            lastReconciledDate: input.statementDate,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(accounts.id, account.id),
              inArray(accounts.budgetId, ownedBudgetIds(ctx))
            )
          );

        return {
          reconciledCount: swept.length,
          adjustmentAmount,
          clearedBalance,
          difference,
        };
      });
    }),
});

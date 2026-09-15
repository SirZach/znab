import { z } from "zod";
import { eq, and, isNull, inArray, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { accounts, payees, transactions } from "@znab/db";
import { reconcileAccountSchema } from "@znab/shared";
import { assertBudgetAccess, ownedBudgetIds } from "../lib/authz";
import {
  balanceAdjustment,
  reconcileDifference,
  RECONCILE_MEMO,
  RECONCILE_PAYEE_NAME,
} from "../lib/reconcile";

/** One page row from the window query: the id and its account-wide balance. */
type PageRow = { id: number; runningBalance: string };
type TotalsRow = {
  balance: string;
  clearedBalance: string;
  unclearedBalance: string;
  count: number;
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
          COUNT(*)::int AS count
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
        hasMore,
      };
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

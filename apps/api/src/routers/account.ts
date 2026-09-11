import { z } from "zod";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { accounts, transactions } from "@znab/db";
import { assertBudgetAccess } from "../lib/authz";

/** One page row from the window query: the id and its account-wide balance. */
type PageRow = { id: number; runningBalance: string };
type TotalsRow = { balance: string; count: number };

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

      // `visible` is newest-first for paging; the register reads oldest-first.
      const page = visible
        .slice()
        .reverse()
        .flatMap((r) => {
          const row = byId.get(r.id);
          return row
            ? [{ ...row, runningBalance: balanceById.get(r.id) ?? 0 }]
            : [];
        });

      return {
        transactions: page,
        balance: parseFloat(totals[0]?.balance ?? "0"),
        total: totals[0]?.count ?? 0,
        hasMore,
      };
    }),
});

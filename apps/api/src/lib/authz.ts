import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { accounts, budgets, categories, payees } from "@znab/db";
import type { Context } from "../context";

/** A context that has already passed through `protectedProcedure`. */
export type AuthedContext = Context & { user: NonNullable<Context["user"]> };

/**
 * Throws unless `budgetId` names a budget owned by the requesting user.
 *
 * Every budget-scoped procedure needs this: `budgetId` arrives from the client
 * and says nothing about who may read it. Filtering a query by `budgetId`
 * alone scopes the rows but not the caller.
 */
export async function assertBudgetAccess(ctx: AuthedContext, budgetId: number) {
  const budget = await ctx.db.query.budgets.findFirst({
    where: and(eq(budgets.id, budgetId), eq(budgets.userId, ctx.user.id)),
  });
  if (!budget) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Budget not found" });
  }
  return budget;
}

/**
 * Sub-select of every budget id the requesting user owns, for writes addressed
 * by row id alone. Constraining the UPDATE itself keeps the check atomic — a
 * read-then-write would leave a window to race — and makes a row belonging to
 * someone else simply match nothing.
 */
export function ownedBudgetIds(ctx: AuthedContext) {
  return ctx.db
    .select({ id: budgets.id })
    .from(budgets)
    .where(eq(budgets.userId, ctx.user.id));
}

/**
 * Throws unless every id the client chose for a row lives in the same budget as
 * the row itself. Owning the row says nothing about the payee, category and
 * account ids sent alongside it: those are plain foreign keys with no budget in
 * them, so an id belonging to someone else would be written and then handed
 * straight back, joined, the next time the register loaded.
 */
export async function assertIdsInBudget(
  // Narrowed to the reads it makes, so an open transaction is as good as the
  // pool here and the caller inside one does not have to reach outside it.
  db: Pick<AuthedContext["db"], "query">,
  budgetId: number,
  ids: {
    payeeId?: number | null;
    categoryId?: number | null;
    accountId?: number | null;
  }
) {
  if (ids.payeeId != null) {
    const payee = await db.query.payees.findFirst({
      where: and(
        eq(payees.id, ids.payeeId),
        eq(payees.budgetId, budgetId),
        isNull(payees.deletedAt)
      ),
      columns: { id: true },
    });
    if (!payee) throw new TRPCError({ code: "NOT_FOUND", message: "Payee not found" });
  }

  if (ids.categoryId != null) {
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, ids.categoryId), eq(categories.budgetId, budgetId)),
      columns: { id: true },
    });
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
  }

  if (ids.accountId != null) {
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, ids.accountId),
        eq(accounts.budgetId, budgetId),
        isNull(accounts.deletedAt)
      ),
      columns: { id: true },
    });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  }
}

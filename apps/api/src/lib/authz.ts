import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { budgets } from "@znab/db";
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

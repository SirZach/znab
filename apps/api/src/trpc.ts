import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context";
import { assertBudgetAccess } from "./lib/authz";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires a valid X-User-Slug header */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No user selected" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * A procedure scoped to one budget the caller owns. Declares `budgetId` as its
 * base input, so a procedure adds its own fields with a further `.input()`,
 * and refuses anyone else's budget with NOT_FOUND before the handler runs. The
 * budget row rides on `ctx.budget`.
 *
 * This proves only who may read the budget. Every other id the client sends
 * (payee, category, account) still has to be checked against it, which is
 * what `assertIdsInBudget` is for.
 */
export const budgetProcedure = protectedProcedure
  .input(z.object({ budgetId: z.number().int().positive() }))
  .use(async ({ ctx, input, next }) => {
    const budget = await assertBudgetAccess(ctx, input.budgetId);
    return next({ ctx: { budget } });
  });

import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { accounts, categories, categoryGroups } from "@znab/db";
import { ownedBudgetIds, type AuthedContext } from "./authz";
import type { Tx } from "./tx";

/**
 * Refuses anything but the complete set, in any order. A partial order would
 * leave what it left out sitting wherever it was, which is how two rows come to
 * claim the same place.
 */
export function assertExactly(sent: number[], live: Set<number>, what: string) {
  const unique = new Set(sent);
  if (
    unique.size !== sent.length ||
    unique.size !== live.size ||
    sent.some((id) => !live.has(id))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The new order has to name each of the ${live.size} ${what} exactly once. Reload the page and try again.`,
    });
  }
}

/**
 * Gives each row its index in `ids` as its sort order, in one statement, so no
 * reader ever sees half an order and a 500 row order is one round trip rather
 * than 500. Scoped to the caller's budgets like every other write here.
 */
export async function reorderRows(
  tx: Tx,
  ctx: AuthedContext,
  table: typeof accounts | typeof categories | typeof categoryGroups,
  ids: number[]
) {
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  );
  await tx.execute(sql`
    UPDATE ${table}
    SET sort_order = v.ord - 1, updated_at = now()
    FROM unnest(ARRAY[${list}]::int[]) WITH ORDINALITY AS v(id, ord)
    WHERE ${table.id} = v.id
      AND ${table.budgetId} IN (${ownedBudgetIds(ctx)})
  `);
}

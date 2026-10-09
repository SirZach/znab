import { and, eq, isNull, sql } from "drizzle-orm";
import { payees } from "@znab/db";
import { normalizePayeeName, payeeNameKey } from "./payee-name";
import type { Tx } from "./tx";

/**
 * The id of the budget's payee called `name`, made on demand. Matched trimmed
 * and case-insensitively, the way `payee.rename` checks for a clash, so a
 * stored name with stray whitespace is reused rather than doubled. Transfer
 * payees are left out of the match: a typed name never quietly turns a row
 * into half of a transfer. Returns null when the name is blank.
 */
export async function findOrCreatePayee(
  tx: Tx,
  budgetId: number,
  rawName: string | null | undefined,
  opts: { enabled?: boolean } = {}
): Promise<number | null> {
  const name = normalizePayeeName(rawName);
  if (!name) return null;

  const existing = await tx.query.payees.findFirst({
    where: and(
      eq(payees.budgetId, budgetId),
      isNull(payees.deletedAt),
      isNull(payees.targetAccountId),
      sql`lower(trim(${payees.name})) = ${payeeNameKey(name)}`
    ),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const [created] = await tx
    .insert(payees)
    .values({
      ynabId: `Payee/${crypto.randomUUID()}`,
      budgetId,
      name,
      ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
    })
    .returning({ id: payees.id });
  return created!.id;
}

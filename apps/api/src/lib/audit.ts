/**
 * The audit log: one row per row a write touched, written in the same
 * transaction as the write so the two commit or roll back together. It covers
 * transactions (transfer pairs included), allocations, scheduled transactions,
 * accounts and category deletes. Not covered: payee merge, which repoints
 * transactions to the kept payee; category create, rename, move, hide and
 * goals; category groups; split parts, which only the importer writes; and the
 * opening-balance category account create can make. The YNAB 4 importer never
 * comes through here; what it writes is YNAB's history, not a change made in
 * znab.
 */
import { auditLog } from "@znab/db";
import type { Tx } from "./tx";

export const AUDIT_ENTITIES = [
  "transaction",
  "monthly_budget",
  "scheduled_transaction",
  "account",
  "category",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

type AuditedRow = { id: number; budgetId: number; deletedAt?: Date | null };

/** Create, update or delete, read off the two sides of one row. */
export function auditAction(before: AuditedRow | undefined, after: AuditedRow | undefined) {
  if (!before) return "create" as const;
  // Nearly everything here is soft deleted, so setting `deletedAt` is the delete.
  if (!after || (after.deletedAt && !before.deletedAt)) return "delete" as const;
  return "update" as const;
}

/**
 * Records a write by the rows as they stood before it and as it left them,
 * paired by id. A row only in `after` was created; one only in `before` was
 * removed outright. Both sides are whole rows as stored. `action` overrides
 * that reading for the rare write that knows better than its rows say, such
 * as an upsert that found a row it had not read.
 */
export async function audit(
  tx: Tx,
  userId: number,
  entity: AuditEntity,
  {
    before = [],
    after = [],
    action,
  }: { before?: AuditedRow[]; after?: AuditedRow[]; action?: ReturnType<typeof auditAction> }
) {
  const ids = new Set([...before, ...after].map((r) => r.id));
  if (ids.size === 0) return;
  const values = [...ids].map((id) => {
    const was = before.find((r) => r.id === id);
    const now = after.find((r) => r.id === id);
    return {
      budgetId: (now ?? was)!.budgetId,
      userId,
      entity,
      entityId: id,
      action: action ?? auditAction(was, now),
      before: was ?? null,
      after: now ?? null,
    };
  });
  await tx.insert(auditLog).values(values);
}

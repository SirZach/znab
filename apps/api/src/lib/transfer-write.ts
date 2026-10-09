/**
 * Writing both rows of a transfer. Shared by entering a transaction by hand and
 * entering a scheduled one, so the two cannot drift apart.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { accounts, payees, transactions } from "@znab/db";
import { transferCategoryId, transferPayeeName, transferPayeeYnabId } from "./transfer";
import type { Tx } from "./tx";

/** The payee a transfer is declared through: the one standing in for the far account. */
export type TransferPayee = { id: number; name: string; targetAccountId: number };

/** Both accounts of a transfer and the payee each side names, resolved once. */
export type TransferEnds = Awaited<ReturnType<typeof resolveTransferEnds>>;

/** What one entry of a transfer carries; the far side mirrors it. */
export type TransferEntry = {
  /** The near side's amount; the far side gets its negation. */
  amount: number;
  date: string;
  categoryId: number | null;
  memo?: string | null;
  /** Per side: only the near row takes these. The far side has not seen the money yet. */
  near?: {
    cleared?: (typeof transactions.$inferInsert)["cleared"];
    accepted?: boolean;
    flagColor?: string | null;
  };
  /** Set on both rows when the entry came from a schedule. */
  dateFromSchedule?: string;
};

/**
 * Resolves the two accounts of a transfer from `nearAccountId` and the payee
 * standing in for the far one, and the payee the far side names this account
 * through. Every imported budget has one per account, but a budget started
 * here has none, so it is made on demand.
 */
export async function resolveTransferEnds(
  tx: Tx,
  budgetId: number,
  nearAccountId: number,
  payee: TransferPayee
) {
  const farAccountId = payee.targetAccountId;
  if (farAccountId === nearAccountId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A transfer has to go to a different account.",
    });
  }

  const ends = await tx.query.accounts.findMany({
    where: and(
      inArray(accounts.id, [nearAccountId, farAccountId]),
      eq(accounts.budgetId, budgetId),
      isNull(accounts.deletedAt)
    ),
    columns: { id: true, name: true, ynabId: true, onBudget: true, hidden: true },
  });
  const near = ends.find((a) => a.id === nearAccountId);
  const far = ends.find((a) => a.id === farAccountId);
  if (!near) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  if (!far) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${payee.name}" points at an account that is no longer in this budget.`,
    });
  }

  const backPayee = await tx.query.payees.findFirst({
    where: and(
      eq(payees.budgetId, budgetId),
      eq(payees.targetAccountId, near.id),
      isNull(payees.deletedAt)
    ),
    columns: { id: true },
  });
  let farPayeeId = backPayee?.id;
  if (!farPayeeId) {
    const [created] = await tx
      .insert(payees)
      .values({
        ynabId: transferPayeeYnabId(near.ynabId),
        budgetId,
        name: transferPayeeName(near.name),
        targetAccountId: near.id,
        // A transfer payee is enabled exactly when its account is open. Taking
        // the default here would put a closed account back in the register's
        // picker the first time anything was transferred out of it.
        enabled: !near.hidden,
      })
      .returning({ id: payees.id });
    farPayeeId = created!.id;
  }

  return { budgetId, near, far, nearPayeeId: payee.id, farPayeeId };
}

/**
 * Inserts both rows of one transfer between ends already resolved, and returns
 * the near one, which is the row the caller asked for. Both ynab ids are minted
 * up front because each row has to name the other. Which side carries the
 * category follows from the two accounts (see `transferCategoryId`). The memo
 * travels: every memoed pair in the imported data carries the same text on
 * both sides.
 */
export async function insertTransferPair(tx: Tx, ends: TransferEnds, entry: TransferEntry) {
  const { budgetId, near, far } = ends;
  const nearYnabId = crypto.randomUUID();
  const farYnabId = crypto.randomUUID();
  const shared = {
    budgetId,
    date: entry.date,
    memo: entry.memo,
    isTransfer: true,
    ...(entry.dateFromSchedule !== undefined ? { dateFromSchedule: entry.dateFromSchedule } : {}),
  };

  const [nearTxn] = await tx
    .insert(transactions)
    .values({
      ...shared,
      ynabId: nearYnabId,
      accountId: near.id,
      payeeId: ends.nearPayeeId,
      categoryId: transferCategoryId(near, far, entry.categoryId),
      amount: String(entry.amount),
      cleared: entry.near?.cleared ?? "Uncleared",
      accepted: entry.near?.accepted ?? true,
      flagColor: entry.near?.flagColor,
      transferAccountId: far.id,
      transferTransactionId: farYnabId,
    })
    .returning();

  await tx.insert(transactions).values({
    ...shared,
    ynabId: farYnabId,
    accountId: far.id,
    payeeId: ends.farPayeeId,
    categoryId: transferCategoryId(far, near, entry.categoryId),
    amount: String(-entry.amount),
    cleared: "Uncleared",
    accepted: true,
    transferAccountId: near.id,
    transferTransactionId: nearYnabId,
  });

  return nearTxn!;
}

/** Resolves the ends and writes one transfer: the whole job for a single entry. */
export async function writeTransferPair(
  tx: Tx,
  budgetId: number,
  nearAccountId: number,
  payee: TransferPayee,
  entry: TransferEntry
) {
  const ends = await resolveTransferEnds(tx, budgetId, nearAccountId, payee);
  return insertTransferPair(tx, ends, entry);
}

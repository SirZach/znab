/**
 * The register's edit rules: what a row seeds its editor with, which of its
 * fields are locked, and what a save sends. Pure, so the add row, the row being
 * edited and the bulk panel can only answer these the same way.
 */

import { FLAG_COLORS, type FlagColor, transferCarriesCategory } from "@znab/shared";
import type { RegisterRowLocks } from "@/components/register/row-fields";
import { amountToFields, fieldsToAmount, type RegisterFields } from "@/lib/register-row";
import { formatDateISO } from "@/lib/utils";

/** Why the fields a row will not let anyone change here are the way they are. */
export const TRANSFER_PAYEE_NOTE =
  "A transfer's payee is the account it moves money to. Delete this transaction and enter it again to send it somewhere else.";
export const TRANSFER_CATEGORY_NOTE =
  "Money moved between two budgeted accounts has not been spent, so it is not categorised.";
export const SPLIT_NOTE =
  "A split's categories and amounts belong to its parts, which this register cannot edit yet.";

/** A row's own cleared status, and the far side's where it has one. */
export type ReconcilableSide = {
  cleared: string;
  counterpartCleared?: string | null;
};

/**
 * Whether changing this row means changing reconciled history. The far side of
 * a transfer counts: the two accounts are reconciled against their own
 * statements, so one side is commonly reconciled while the other is not, and a
 * delete takes both. The API refuses either case without an acknowledgement, so
 * this is the same question it asks, asked in the one place the warning and the
 * acknowledgement both read from.
 */
export function isReconciled(txn: ReconcilableSide): boolean {
  return txn.cleared === "Reconciled" || txn.counterpartCleared === "Reconciled";
}

/** A blank add row, dated today. */
export const emptyFields = (): RegisterFields => ({
  date: new Date(),
  payeeId: null,
  payeeName: "",
  categoryId: null,
  memo: "",
  flagColor: null,
  outflow: "",
  inflow: "",
});

/**
 * The flag as a colour this register knows how to draw. The column behind it is
 * free text and the imported data was never checked against anything, so a
 * value outside the six shows as no flag rather than as a swatch of nothing.
 */
export const flagColorOf = (value: string | null): FlagColor | null =>
  FLAG_COLORS.includes(value as FlagColor) ? (value as FlagColor) : null;

/** The parts of a stored row an editor is seeded from. */
export type EditableTransaction = {
  date: string;
  payeeId: number | null;
  payee: { name: string } | null;
  categoryId: number | null;
  memo: string | null;
  flagColor: string | null;
  amount: string | number;
};

/** The row as it stands, ready to be edited. */
export const fieldsFrom = (txn: EditableTransaction): RegisterFields => ({
  // Local midnight, the way every other date in the register is read, so a row
  // does not shift a day on its way into the picker.
  date: new Date(`${txn.date}T00:00:00`),
  payeeId: txn.payeeId,
  payeeName: txn.payee?.name ?? "",
  categoryId: txn.categoryId,
  memo: txn.memo ?? "",
  flagColor: flagColorOf(txn.flagColor),
  ...amountToFields(txn.amount),
});

/**
 * Whether a row moving money to `transferAccountId` carries a category in the
 * register of `account`. A row that is not a transfer always does; a transfer
 * only does on the on-budget side of a pair whose other side is off budget. The
 * register asks this to decide what to show, and the update to decide what to
 * send, so the two cannot disagree.
 */
export function transferKeepsCategory(
  account: { onBudget: boolean } | undefined,
  accounts: ReadonlyArray<{ id: number; onBudget: boolean }> | undefined,
  transferAccountId: number | null
): boolean {
  return (
    transferAccountId === null ||
    transferCarriesCategory(
      account,
      accounts?.find((a) => a.id === transferAccountId)
    )
  );
}

/** What `locksFor` reads off a row. */
export type LockableRow = {
  isSplit?: boolean;
  isTransfer?: boolean;
  transferAccountId: number | null;
};

/**
 * What a row will not let anyone change here. A transfer's payee is the
 * account on the other end, and a transfer carries a category on one side of
 * the pair at most: both rules the API enforces on save, so the register
 * shows them rather than fights them. A split's category and amount are the
 * sum of its parts, and there is no editor for those, so changing either here
 * would only break the split.
 */
export function locksFor(
  row: LockableRow,
  keepsCategory: (transferAccountId: number | null) => boolean
): RegisterRowLocks {
  const locks: RegisterRowLocks = {};
  if (row.isTransfer) locks.payee = TRANSFER_PAYEE_NOTE;
  if (row.isSplit) {
    locks.category = { label: "Split", reason: SPLIT_NOTE };
    locks.amount = SPLIT_NOTE;
  } else if (!keepsCategory(row.transferAccountId)) {
    locks.category = { label: "No category", reason: TRANSFER_CATEGORY_NOTE };
  }
  return locks;
}

/**
 * The create payload for a new row, or null when it is not one. A blank new
 * row is someone who has not finished typing, not a transaction of nothing, so
 * zero is refused here but allowed on an edit.
 */
export function buildTransactionCreate(
  ids: { budgetId: number; accountId: number },
  fields: RegisterFields
) {
  const amount = fieldsToAmount(fields);
  if (!fields.date || amount === null || amount === 0) return null;
  return {
    ...ids,
    payeeId: fields.payeeId,
    payeeName: fields.payeeId ? undefined : fields.payeeName || undefined,
    categoryId: fields.categoryId,
    amount,
    date: formatDateISO(fields.date),
    memo: fields.memo || undefined,
    flagColor: fields.flagColor,
    cleared: "Uncleared" as const,
    accepted: true,
  };
}

/** What `buildTransactionUpdate` reads off the stored row. */
export type UpdatableRow = ReconcilableSide & {
  id: number;
  isSplit: boolean;
  isTransfer: boolean;
};

/**
 * The update payload for a row already on the books, or null when the fields
 * cannot be read as one. A transfer's payee is left out: it is the other
 * account's name, and the API refuses to move one side of a pair to a different
 * payee. An empty memo is sent as the empty string rather than dropped, so a
 * memo can be cleared.
 *
 * A reconciled row is acknowledged rather than refused: the register asks
 * before it opens one for editing, so reaching here is the reader saying they
 * meant it.
 */
export function buildTransactionUpdate(
  txn: UpdatableRow,
  fields: RegisterFields,
  keepsCategory: boolean
) {
  const amount = fieldsToAmount(fields);
  if (!fields.date || amount === null) return null;
  return {
    id: txn.id,
    ...(txn.isTransfer
      ? {}
      : {
          payeeId: fields.payeeId,
          payeeName: fields.payeeId ? undefined : fields.payeeName || undefined,
        }),
    // Absent rather than null where the row shows no category to edit: a
    // transfer's category is held on whichever side is on budget, and a null
    // sent from the other side would clear it there. A split's categories
    // belong to its parts.
    ...(!txn.isSplit && keepsCategory ? { categoryId: fields.categoryId } : {}),
    amount,
    date: formatDateISO(fields.date),
    memo: fields.memo,
    flagColor: fields.flagColor,
    acknowledgeReconciled: isReconciled(txn),
  };
}

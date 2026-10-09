import { trpc } from "@/trpc";
import { invalidateMoney } from "@/lib/invalidate";
import {
  buildTransactionCreate,
  buildTransactionUpdate,
  isReconciled,
  type ReconcilableSide,
  type UpdatableRow,
} from "@/lib/register-edit";
import type { RegisterFields } from "@/lib/register-row";

/**
 * Writes to the register's rows. Every one refetches rather than patching the
 * cache: a back-dated or re-dated row resorts the register and shifts every
 * running balance after it, and a deleted transfer takes a row out of another
 * account entirely.
 */
export function useRegisterWrites({
  budgetId,
  accountId,
  transferKeepsCategory,
  onCreated,
}: {
  budgetId: number;
  accountId: number;
  transferKeepsCategory: (transferAccountId: number | null) => boolean;
  /** After a new row is saved and the register has refetched. */
  onCreated?: () => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => invalidateMoney(utils);

  const setClearedMutation = trpc.transaction.setClearedStatus.useMutation({
    onSuccess: invalidate,
  });
  const updateMutation = trpc.transaction.update.useMutation({ onSuccess: invalidate });
  const deleteMutation = trpc.transaction.delete.useMutation({ onSuccess: invalidate });
  const createMutation = trpc.transaction.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      onCreated?.();
    },
  });

  return {
    createTransaction(fields: RegisterFields) {
      const input = buildTransactionCreate({ budgetId, accountId }, fields);
      if (input) createMutation.mutate(input);
    },

    updateTransaction(
      txn: UpdatableRow & { transferAccountId: number | null },
      fields: RegisterFields,
      onDone?: () => void
    ) {
      const input = buildTransactionUpdate(
        txn,
        fields,
        transferKeepsCategory(txn.transferAccountId)
      );
      if (input) updateMutation.mutate(input, { onSuccess: () => onDone?.() });
    },

    // onDone closes the row only once it is really gone, so a refused delete
    // leaves the row open with its error against it.
    deleteTransaction(txn: ReconcilableSide & { id: number }, onDone?: () => void) {
      deleteMutation.mutate(
        { id: txn.id, acknowledgeReconciled: isReconciled(txn) },
        { onSuccess: () => onDone?.() }
      );
    },

    /**
     * Tick a row off, or untick it. Reconciled is not part of the cycle: a row
     * gets there by being reconciled against a statement, and the API refuses
     * to move one back out, so a reconciled row is left alone here rather than
     * sent a call that is already known to be refused.
     */
    cycleCleared(current: string, id: number) {
      if (current === "Reconciled") return;
      setClearedMutation.mutate({
        id,
        cleared: current === "Cleared" ? "Uncleared" : "Cleared",
      });
    },

    isSaving: createMutation.isPending,
    isSavingEdit: updateMutation.isPending || deleteMutation.isPending,

    // The API writes these for a reader ("Delete it and enter it again."), so
    // they are shown as they arrive. Without the create one a refused entry
    // just vanished, which is how a register loses a transaction quietly.
    createError: createMutation.error?.message ?? null,
    updateError: updateMutation.error?.message ?? null,
    deleteError: deleteMutation.error?.message ?? null,

    /** Drop a stale error, for when the register moves to a different row. */
    resetEditStatus: () => {
      updateMutation.reset();
      deleteMutation.reset();
    },
    /** The same, for the add row, which clears itself on a successful save. */
    resetCreateStatus: () => createMutation.reset(),
  };
}

import { useState } from "react";
import { toast } from "sonner";
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

  // Ticking down a statement row by row cannot wait on a round trip each time,
  // so the C column shows the click at once. Each row's override holds until
  // the refetch after its save lands, or is dropped when the save fails. A
  // later click on the same row owns the override, so an earlier save settling
  // leaves it alone.
  const [clearedOverrides, setClearedOverrides] = useState<Record<number, string>>({});
  const dropOverride = (id: number, cleared: string) =>
    setClearedOverrides((prev) => {
      if (prev[id] !== cleared) return prev;
      const { [id]: _, ...rest } = prev;
      return rest;
    });

  const setClearedMutation = trpc.transaction.setClearedStatus.useMutation({
    onSuccess: async (_data, { id, cleared }) => {
      await invalidate();
      dropOverride(id, cleared);
    },
    onError: (error, { id, cleared }) => {
      dropOverride(id, cleared);
      // One toast however many rows failed together, as a bulk change can.
      toast.error("Cleared status was not saved", {
        id: "cleared-not-saved",
        description: error.message,
      });
      invalidate();
    },
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
      const shown = clearedOverrides[id] ?? current;
      if (shown === "Reconciled") return;
      const cleared = shown === "Cleared" ? "Uncleared" : "Cleared";
      setClearedOverrides((prev) => ({ ...prev, [id]: cleared }));
      setClearedMutation.mutate({ id, cleared });
    },

    /** A row's cleared status as the register should show it, clicks included. */
    clearedOf: (txn: { id: number; cleared: string }) => clearedOverrides[txn.id] ?? txn.cleared,

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

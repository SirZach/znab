import { invalidateMoney } from "@/lib/invalidate";
import { trpc } from "@/trpc";
import type { AccountType } from "@znab/shared";
import type { AccountPatch } from "@/lib/accounts";

/**
 * One row of the manage list. Read back off the hook rather than off the router
 * types, since the web app depends on the tRPC client only.
 */
export type ManagedAccount = ReturnType<typeof useAccounts>["accounts"][number];

/** What opening an account asks for. A starting balance is optional. */
export type NewAccount = {
  name: string;
  accountType: AccountType;
  onBudget: boolean;
  note?: string;
  startingBalance?: number;
  startingBalanceDate?: string;
};

export function useAccounts({ budgetId }: { budgetId: number }) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.account.list.useQuery({ budgetId });

  // An account carries a transfer payee named after it, a starting balance is a
  // transaction, and on budget or account type changes feed the budget engine,
  // so every account write can move money or names shown beside it.
  const invalidate = () => invalidateMoney(utils);

  const createMutation = trpc.account.create.useMutation({ onSuccess: invalidate });

  // Renaming happens in the list and the rest is edited in the panel, so they
  // get a mutation each: one write's error has no business turning up beside
  // the other's controls.
  const renameMutation = trpc.account.update.useMutation({ onSuccess: invalidate });
  const updateMutation = trpc.account.update.useMutation({ onSuccess: invalidate });
  const hiddenMutation = trpc.account.setHidden.useMutation({ onSuccess: invalidate });
  const reorderMutation = trpc.account.reorder.useMutation({ onSuccess: invalidate });
  const deleteMutation = trpc.account.delete.useMutation({ onSuccess: invalidate });

  return {
    accounts: data ?? [],
    isLoading,

    // onDone lets the form clear itself only once the account really exists, so
    // a refused name leaves what was typed there to correct.
    create: (account: NewAccount, onDone?: () => void) =>
      createMutation.mutate(
        { budgetId, ...account },
        { onSuccess: () => onDone?.() }
      ),
    rename: (accountId: number, name: string) =>
      renameMutation.mutate({ budgetId, accountId, name }),
    // Absent keys are left alone, so the panel sends only what it changed.
    update: (accountId: number, patch: AccountPatch) =>
      updateMutation.mutate({ budgetId, accountId, ...patch }),
    setHidden: (accountId: number, hidden: boolean) =>
      hiddenMutation.mutate({ budgetId, accountId, hidden }),
    /** The budget's whole order, which is what the API checks the set against. */
    reorder: (accountIds: number[]) =>
      reorderMutation.mutate({ budgetId, accountIds }),
    remove: (accountId: number) =>
      deleteMutation.mutate({ budgetId, accountId }),

    isCreating: createMutation.isPending,
    isSaving: updateMutation.isPending,
    isReordering: reorderMutation.isPending,

    // The API writes these for a reader ("... Close it instead."), so they are
    // shown as they arrive rather than flattened to one message.
    createError: createMutation.error?.message ?? null,
    renameError: renameMutation.error?.message ?? null,
    updateError: updateMutation.error?.message ?? null,
    hiddenError: hiddenMutation.error?.message ?? null,
    reorderError: reorderMutation.error?.message ?? null,
    deleteError: deleteMutation.error?.message ?? null,

    /** Drop stale errors, for when the screen changes subject. */
    resetStatus: () => {
      createMutation.reset();
      renameMutation.reset();
      updateMutation.reset();
      hiddenMutation.reset();
      reorderMutation.reset();
      deleteMutation.reset();
    },
  };
}

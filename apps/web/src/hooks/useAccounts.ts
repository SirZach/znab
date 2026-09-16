import { trpc } from "@/trpc";
import type { AccountType } from "@znab/shared";

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

  // An account carries a transfer payee that mirrors its name, so opening,
  // renaming or removing one leaves every list a payee is picked from stale as
  // well as the account lists themselves.
  const invalidateLists = () =>
    Promise.all([
      utils.account.list.invalidate(),
      utils.payee.list.invalidate(),
      utils.payee.listForManage.invalidate(),
    ]);

  // A register prints that transfer payee's name on every transfer row, so a
  // rename leaves the registers stale too.
  const invalidateEverywhere = () =>
    Promise.all([invalidateLists(), utils.account.transactions.invalidate()]);

  const createMutation = trpc.account.create.useMutation({
    onSuccess: () =>
      Promise.all([
        invalidateLists(),
        // A starting balance is a transaction: on a budget account it is income
        // waiting to be budgeted, and either way it moves net worth.
        utils.budget.monthBudget.invalidate(),
        utils.report.netWorth.invalidate(),
        // Opening a credit account in the red also mints the pre-YNAB debt
        // category that balance is filed under. Every list that reads
        // categories today drops system ones, so nothing would show it stale,
        // but that is the readers being incurious rather than a guarantee.
        utils.category.list.invalidate(),
      ]),
  });

  // Renaming happens in the list and the rest is edited in the panel, so they
  // get a mutation each: one write's error has no business turning up beside
  // the other's controls.
  const renameMutation = trpc.account.update.useMutation({
    onSuccess: invalidateEverywhere,
  });
  const updateMutation = trpc.account.update.useMutation({
    onSuccess: invalidateLists,
  });

  // Closing, reopening and reordering only move an account around the lists
  // this query feeds, the sidebar included.
  const hiddenMutation = trpc.account.setHidden.useMutation({
    onSuccess: () => utils.account.list.invalidate(),
  });
  const reorderMutation = trpc.account.reorder.useMutation({
    onSuccess: () => utils.account.list.invalidate(),
  });

  const deleteMutation = trpc.account.delete.useMutation({
    onSuccess: invalidateLists,
  });

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
    update: (
      accountId: number,
      patch: {
        accountType?: AccountType;
        onBudget?: boolean;
        note?: string;
      }
    ) => updateMutation.mutate({ budgetId, accountId, ...patch }),
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

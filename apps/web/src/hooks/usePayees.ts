import { trpc } from "@/trpc";
import type { PayeeRenameOperator } from "@znab/shared";

/**
 * One row of the manage list. Read back off the hook rather than off the router
 * types, since the web app depends on the tRPC client only.
 */
export type ManagedPayee = ReturnType<typeof usePayees>["payees"][number];

export function usePayees({
  budgetId,
  includeDisabled,
}: {
  budgetId: number;
  includeDisabled: boolean;
}) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.payee.listForManage.useQuery({
    budgetId,
    includeDisabled,
  });
  const { data: categoryGroups } = trpc.category.list.useQuery({ budgetId });

  // A payee's name is printed on every register row it appears in, and merging
  // moves transactions between payees, so a rename or a merge leaves the
  // registers and the budget grid stale, not just this screen's own list.
  const invalidateEverywhere = () =>
    Promise.all([
      utils.payee.listForManage.invalidate(),
      utils.payee.list.invalidate(),
      utils.account.transactions.invalidate(),
      utils.budget.monthBudget.invalidate(),
    ]);

  // Autofill defaults, rename rules and deleting a payee nothing points at
  // change no transaction already on the books, only the lists a payee is
  // picked from.
  const invalidateLists = () =>
    Promise.all([
      utils.payee.listForManage.invalidate(),
      utils.payee.list.invalidate(),
    ]);

  const renameMutation = trpc.payee.rename.useMutation({
    onSuccess: invalidateEverywhere,
  });
  const mergeMutation = trpc.payee.merge.useMutation({
    onSuccess: invalidateEverywhere,
  });
  const deleteMutation = trpc.payee.delete.useMutation({
    onSuccess: invalidateLists,
  });
  const autofillMutation = trpc.payee.setAutofill.useMutation({
    onSuccess: invalidateLists,
  });
  const addRuleMutation = trpc.payee.addRenameRule.useMutation({
    onSuccess: invalidateLists,
  });
  const deleteRuleMutation = trpc.payee.deleteRenameRule.useMutation({
    onSuccess: invalidateLists,
  });

  // The register's picker hides system groups, and an autofill category is the
  // same choice made ahead of time, so it offers the same list.
  const categoryOptions =
    categoryGroups
      ?.filter((g) => !g.isSystem)
      .flatMap((g) =>
        g.categories.map((c) => ({ id: c.id, label: `${g.name}: ${c.name}` }))
      ) ?? [];

  return {
    payees: data ?? [],
    categoryOptions,
    isLoading,

    rename: (id: number, name: string) =>
      renameMutation.mutate({ budgetId, id, name }),
    merge: (sourceIds: number[], targetId: number) =>
      mergeMutation.mutate({ budgetId, sourceIds, targetId }),
    remove: (id: number) => deleteMutation.mutate({ budgetId, id }),
    setAutofill: (args: {
      id: number;
      categoryId: number | null;
      amount: number | null;
      memo: string | null;
    }) => autofillMutation.mutate({ budgetId, ...args }),
    // onDone lets the form clear itself only once the rule is really stored, so
    // a refused duplicate leaves the text there to correct.
    addRenameRule: (
      payeeId: number,
      operator: PayeeRenameOperator,
      operand: string,
      onDone?: () => void
    ) =>
      addRuleMutation.mutate(
        { budgetId, payeeId, operator, operand },
        { onSuccess: () => onDone?.() }
      ),
    deleteRenameRule: (id: number) =>
      deleteRuleMutation.mutate({ budgetId, id }),

    isMerging: mergeMutation.isPending,
    isSavingAutofill: autofillMutation.isPending,
    isAddingRule: addRuleMutation.isPending,

    // The API writes these for a reader ("... Merge the two payees instead."),
    // so they are shown as they arrive rather than flattened to one message.
    renameError: renameMutation.error?.message ?? null,
    mergeError: mergeMutation.error?.message ?? null,
    deleteError: deleteMutation.error?.message ?? null,
    autofillError: autofillMutation.error?.message ?? null,
    ruleError:
      addRuleMutation.error?.message ?? deleteRuleMutation.error?.message ?? null,

    /** What the last merge actually moved, for reporting it back. */
    mergeResult: mergeMutation.data ?? null,

    /** Drop stale errors and results, for when the screen changes subject. */
    resetStatus: () => {
      renameMutation.reset();
      mergeMutation.reset();
      deleteMutation.reset();
      autofillMutation.reset();
      addRuleMutation.reset();
      deleteRuleMutation.reset();
    },
  };
}

import { toCategoryOptions } from "@/lib/category-options";
import { invalidateMoney } from "@/lib/invalidate";
import { trpc } from "@/trpc";
import type { PayeeRenameOperator } from "@znab/shared";

/**
 * One row of the manage list. Read back off the hook rather than off the router
 * types, since the web app depends on the tRPC client only.
 */
export type ManagedPayee = ReturnType<typeof usePayees>["payees"][number];

/** A payee's autofill defaults as the inspector saves them. */
export type AutofillInput = {
  id: number;
  categoryId: number | null;
  amount: number | null;
  memo: string | null;
};

/** Stores a rename rule; `onDone` runs only once it is really stored. */
export type AddRenameRule = ReturnType<typeof usePayees>["addRenameRule"];

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

  // Autofill defaults, rename rules and deleting a payee nothing points at
  // change no transaction already on the books, only the lists a payee is
  // picked from.
  const invalidateLists = () => utils.payee.invalidate();

  // A payee's name is printed on every register row and report it appears in,
  // and merging moves transactions between payees.
  const invalidateEverywhere = () => invalidateMoney(utils);

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

  // An autofill category is the register's choice made ahead of time, so it
  // offers the register's list.
  const categoryOptions = toCategoryOptions(categoryGroups);

  return {
    payees: data ?? [],
    categoryOptions,
    isLoading,

    rename: (id: number, name: string) =>
      renameMutation.mutate({ budgetId, id, name }),
    merge: (sourceIds: number[], targetId: number) =>
      mergeMutation.mutate({ budgetId, sourceIds, targetId }),
    remove: (id: number) => deleteMutation.mutate({ budgetId, id }),
    setAutofill: (args: AutofillInput) => autofillMutation.mutate({ budgetId, ...args }),
    // onDone lets the form clear itself only once the rule is really stored, so
    // a refused duplicate leaves the text there to correct.
    addRenameRule: (
      payeeId: number,
      operator: PayeeRenameOperator,
      operand: string,
      onDone?: () => void
    ): void =>
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

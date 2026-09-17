import { trpc } from "@/trpc";

/**
 * One group of the manage list, its categories nested. Read back off the hook
 * rather than off the router types, since the web app depends on the tRPC
 * client only.
 */
export type ManagedGroup = ReturnType<typeof useCategories>["groups"][number];
export type ManagedCategory = ManagedGroup["categories"][number];

export function useCategories({ budgetId }: { budgetId: number }) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.category.list.useQuery({ budgetId });

  // The budget grid draws these same groups and categories in this same order,
  // so a name, a move or a reorder leaves a month of it stale as well as the
  // lists a category is picked from.
  const invalidate = () =>
    Promise.all([
      utils.category.list.invalidate(),
      utils.budget.monthBudget.invalidate(),
      utils.budget.monthData.invalidate(),
    ]);

  // One mutation per write: one write's refusal has no business turning up
  // beside another's controls.
  const createMutation = trpc.category.create.useMutation({
    onSuccess: invalidate,
  });
  const renameMutation = trpc.category.rename.useMutation({
    onSuccess: invalidate,
  });
  const deleteMutation = trpc.category.remove.useMutation({
    onSuccess: invalidate,
  });
  const moveMutation = trpc.category.move.useMutation({ onSuccess: invalidate });
  const reorderMutation = trpc.category.reorder.useMutation({
    onSuccess: invalidate,
  });

  const createGroupMutation = trpc.category.createGroup.useMutation({
    onSuccess: invalidate,
  });
  const renameGroupMutation = trpc.category.renameGroup.useMutation({
    onSuccess: invalidate,
  });
  const deleteGroupMutation = trpc.category.removeGroup.useMutation({
    onSuccess: invalidate,
  });
  const reorderGroupsMutation = trpc.category.reorderGroups.useMutation({
    onSuccess: invalidate,
  });

  return {
    groups: data ?? [],
    isLoading,

    // onDone lets a form clear itself only once the name really exists, so a
    // refused one is left there to correct.
    create: (groupId: number, name: string, onDone?: () => void) =>
      createMutation.mutate(
        { budgetId, groupId, name },
        { onSuccess: () => onDone?.() }
      ),
    rename: (categoryId: number, name: string) =>
      renameMutation.mutate({ budgetId, categoryId, name }),
    remove: (categoryId: number) =>
      deleteMutation.mutate({ budgetId, categoryId }),
    /** Lands at the end of the group it moves to. */
    move: (categoryId: number, groupId: number) =>
      moveMutation.mutate({ budgetId, categoryId, groupId }),
    /** The group's whole order, which is what the API checks the set against. */
    reorder: (groupId: number, categoryIds: number[]) =>
      reorderMutation.mutate({ budgetId, groupId, categoryIds }),

    createGroup: (name: string, onDone?: () => void) =>
      createGroupMutation.mutate(
        { budgetId, name },
        { onSuccess: () => onDone?.() }
      ),
    renameGroup: (groupId: number, name: string) =>
      renameGroupMutation.mutate({ budgetId, groupId, name }),
    removeGroup: (groupId: number) =>
      deleteGroupMutation.mutate({ budgetId, groupId }),
    /** Every non-system group in order: the system ones do not move. */
    reorderGroups: (groupIds: number[]) =>
      reorderGroupsMutation.mutate({ budgetId, groupIds }),

    isCreating: createMutation.isPending,
    isCreatingGroup: createGroupMutation.isPending,
    isReordering:
      reorderMutation.isPending || reorderGroupsMutation.isPending,

    // The API writes these for a reader ("... hide it instead."), so they are
    // shown as they arrive rather than flattened to one message.
    createError: createMutation.error?.message ?? null,
    renameError: renameMutation.error?.message ?? null,
    deleteError: deleteMutation.error?.message ?? null,
    moveError: moveMutation.error?.message ?? null,
    reorderError: reorderMutation.error?.message ?? null,
    createGroupError: createGroupMutation.error?.message ?? null,
    renameGroupError: renameGroupMutation.error?.message ?? null,
    deleteGroupError: deleteGroupMutation.error?.message ?? null,
    reorderGroupsError: reorderGroupsMutation.error?.message ?? null,

    /** Drop stale errors, for when the screen changes subject. */
    resetStatus: () => {
      createMutation.reset();
      renameMutation.reset();
      deleteMutation.reset();
      moveMutation.reset();
      reorderMutation.reset();
      createGroupMutation.reset();
      renameGroupMutation.reset();
      deleteGroupMutation.reset();
      reorderGroupsMutation.reset();
    },
  };
}

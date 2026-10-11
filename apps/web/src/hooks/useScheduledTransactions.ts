import { toCategoryOptions } from "@/lib/category-options";
import { invalidateMoney } from "@/lib/invalidate";
import type { NewScheduled } from "@/lib/schedule-draft";
import { trpc } from "@/trpc";

export type { NewScheduled };

/**
 * One row of the manage list. Read back off the hook rather than off the router
 * types, since the web app depends on the tRPC client only.
 */
export type ScheduledTransaction =
  ReturnType<typeof useScheduledTransactions>["scheduled"][number];

export function useScheduledTransactions({ budgetId }: { budgetId: number }) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.scheduledTransaction.list.useQuery({
    budgetId,
  });

  // What the schedule form picks from.
  const { data: accounts } = trpc.account.list.useQuery({ budgetId });
  const { data: payees } = trpc.payee.list.useQuery({ budgetId });
  const { data: categoryGroups } = trpc.category.list.useQuery({ budgetId });

  // Entering a schedule writes real transactions, and a payee named on the fly
  // is a new payee, so every write here can move money.
  const invalidate = () => invalidateMoney(utils);

  // One mutation per write: one write's refusal has no business turning up
  // beside another's controls.
  const createMutation = trpc.scheduledTransaction.create.useMutation({
    onSuccess: invalidate,
  });
  const updateMutation = trpc.scheduledTransaction.update.useMutation({
    onSuccess: invalidate,
  });
  const deleteMutation = trpc.scheduledTransaction.remove.useMutation({
    onSuccess: invalidate,
  });
  const enterMutation = trpc.scheduledTransaction.enter.useMutation({
    onSuccess: invalidate,
  });
  const skipMutation = trpc.scheduledTransaction.skip.useMutation({
    onSuccess: invalidate,
  });
  const enterDueMutation = trpc.scheduledTransaction.enterDue.useMutation({
    onSuccess: invalidate,
  });

  return {
    scheduled: data ?? [],
    isLoading,

    // A closed account takes no new transactions, so it is not offered as a
    // home for one that would keep arriving.
    openAccounts: accounts?.filter((a) => !a.hidden) ?? [],
    payees,
    // A schedule files its money the way a transaction does, so it offers the
    // register's list.
    categoryOptions: toCategoryOptions(categoryGroups),

    // onDone lets a form clear itself only once the schedule really exists, so
    // a refused one is left there to correct.
    create: (schedule: NewScheduled, onDone?: () => void) =>
      createMutation.mutate(
        { budgetId, ...schedule },
        { onSuccess: () => onDone?.() }
      ),
    // Absent keys are left alone, so the panel sends only what it changed. A
    // payee named rather than picked is resolved by the API only when no id
    // arrives with the name, so the id is dropped when there is a name.
    update: (id: number, patch: Partial<NewScheduled>) =>
      updateMutation.mutate({
        id,
        ...patch,
        ...(patch.payeeName ? { payeeId: undefined } : {}),
      }),
    remove: (id: number) => deleteMutation.mutate({ id }),
    /** Writes the occurrence the schedule is standing on and moves it along. */
    enter: (id: number) => enterMutation.mutate({ id }),
    /** Moves past that occurrence without writing anything. */
    skip: (id: number) => skipMutation.mutate({ id }),
    /** Catches every schedule in the budget up to today. */
    enterDue: () => enterDueMutation.mutate({ budgetId }),

    isCreating: createMutation.isPending,
    isSaving: updateMutation.isPending,
    isEntering: enterMutation.isPending,
    isSkipping: skipMutation.isPending,
    isEnteringDue: enterDueMutation.isPending,

    // The API writes these for a reader ("... Delete it instead."), so they are
    // shown as they arrive rather than flattened to one message.
    createError: createMutation.error?.message ?? null,
    updateError: updateMutation.error?.message ?? null,
    deleteError: deleteMutation.error?.message ?? null,
    enterError: enterMutation.error?.message ?? null,
    skipError: skipMutation.error?.message ?? null,
    enterDueError: enterDueMutation.error?.message ?? null,

    /** What the last sweep actually entered, for reporting it back. */
    enterDueResult: enterDueMutation.data ?? null,

    /** Drop stale errors and results, for when the screen changes subject. */
    resetStatus: () => {
      createMutation.reset();
      updateMutation.reset();
      deleteMutation.reset();
      enterMutation.reset();
      skipMutation.reset();
      enterDueMutation.reset();
    },
  };
}

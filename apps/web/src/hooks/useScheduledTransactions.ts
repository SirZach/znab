import { trpc } from "@/trpc";
import type { FrequencyValue } from "@znab/shared";

/**
 * One row of the manage list. Read back off the hook rather than off the router
 * types, since the web app depends on the tRPC client only.
 */
export type ScheduledTransaction =
  ReturnType<typeof useScheduledTransactions>["scheduled"][number];

/** What a schedule is made of. A payee may be named instead of picked. */
export type NewScheduled = {
  accountId: number;
  payeeId: number | null;
  payeeName?: string;
  categoryId: number | null;
  /** Negative is an outflow, the way the API reads it. */
  amount: number;
  date: string;
  frequency: FrequencyValue;
  twiceMonthDay?: number | null;
  memo?: string;
};

export function useScheduledTransactions({ budgetId }: { budgetId: number }) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.scheduledTransaction.list.useQuery({
    budgetId,
  });

  // Entering a schedule writes real transactions, so the register they land in,
  // the month that budgets them and net worth all go stale, not just the lists
  // of schedules. A transfer moves an account balance, and a payee named on the
  // fly is a new payee, so those two lists go with them.
  const invalidate = () =>
    Promise.all([
      utils.scheduledTransaction.list.invalidate(),
      utils.scheduledTransaction.upcoming.invalidate(),
      utils.account.transactions.invalidate(),
      utils.budget.monthBudget.invalidate(),
      utils.report.netWorth.invalidate(),
      utils.account.list.invalidate(),
      utils.payee.list.invalidate(),
      utils.payee.listForManage.invalidate(),
    ]);

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

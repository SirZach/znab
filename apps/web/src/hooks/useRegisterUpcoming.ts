import { trpc } from "@/trpc";
import { invalidateMoney } from "@/lib/invalidate";

/**
 * What this account has due or coming up, for the band above the register,
 * and entering or skipping one. Not `useScheduledTransactions`: that one also
 * loads every schedule in the budget, which this band never shows.
 */
export function useRegisterUpcoming({
  budgetId,
  accountId,
}: {
  budgetId: number;
  accountId: number;
}) {
  const utils = trpc.useUtils();
  const { data } = trpc.scheduledTransaction.upcoming.useQuery({ budgetId, accountId });

  const enterMutation = trpc.scheduledTransaction.enter.useMutation({
    onSuccess: () => invalidateMoney(utils),
  });
  const skipMutation = trpc.scheduledTransaction.skip.useMutation({
    onSuccess: () => invalidateMoney(utils),
  });

  return {
    /** The occurrences due or coming up in this account, earliest first. */
    upcoming: data ?? [],
    enter: (id: number) => enterMutation.mutate({ id }),
    skip: (id: number) => skipMutation.mutate({ id }),
    isBusy: enterMutation.isPending || skipMutation.isPending,
    error: enterMutation.error?.message ?? skipMutation.error?.message ?? null,
  };
}

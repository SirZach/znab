import { trpc } from "@/trpc";
import { invalidateMoney } from "@/lib/invalidate";

/** Reconciling an account against a statement, and what the last one did. */
export function useReconcile({ budgetId, accountId }: { budgetId: number; accountId: number }) {
  const utils = trpc.useUtils();
  const mutation = trpc.account.reconcile.useMutation({
    onSuccess: () => invalidateMoney(utils),
  });

  return {
    /**
     * `adjustment` is the reader's answer to a difference: without it the API
     * refuses to write a reconciliation that does not add up, which is what
     * puts the question in front of them in the first place.
     */
    reconcile(
      input: { statementDate: string; statementBalance: number; adjustment: boolean },
      onDone?: () => void
    ) {
      mutation.mutate({ budgetId, accountId, ...input }, { onSuccess: () => onDone?.() });
    },
    isReconciling: mutation.isPending,
    error: mutation.error?.message ?? null,
    /** What the last reconciliation actually did, for reporting it back. */
    result: mutation.data ?? null,
    /** For the panel, which reports what it did after closing. */
    reset: () => mutation.reset(),
  };
}

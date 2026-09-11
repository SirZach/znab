import React, { useState } from "react";
import { format } from "date-fns";
import { trpc } from "@/trpc";

/** How many transactions the register loads at a time, newest first. */
const PAGE_SIZE = 200;

export function useAccountRegister({
  budgetId,
  accountId,
  cleared,
  q,
  scrollRef,
  onSaveSuccess,
}: {
  budgetId: number;
  accountId: number;
  cleared: "all" | "Uncleared" | "Cleared" | "Reconciled";
  q: string | undefined;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSaveSuccess?: () => void;
}) {
  const utils = trpc.useUtils();

  // Grows as the reader asks for older transactions. The window stays anchored
  // to the newest transaction, so recent activity is always on screen.
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Reset back to one page whenever the register being viewed changes.
  React.useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [accountId, cleared, q]);

  const { data, isLoading, isFetching } = trpc.account.transactions.useQuery({
    budgetId,
    accountId,
    cleared,
    q,
    limit,
  });

  const { data: accounts } = trpc.account.list.useQuery({ budgetId });
  const account = accounts?.find((a) => a.id === accountId);

  const { data: categoryGroups } = trpc.category.list.useQuery({ budgetId });
  const { data: payeeList } = trpc.payee.list.useQuery({ budgetId });

  // Entering or clearing a transaction changes the category's activity, so the
  // budget grid is stale too — not just this register.
  function invalidateRegister() {
    return Promise.all([
      utils.account.transactions.invalidate(),
      utils.budget.monthBudget.invalidate(),
    ]);
  }

  const setClearedMutation = trpc.transaction.setClearedStatus.useMutation({
    onSuccess: invalidateRegister,
  });

  const createMutation = trpc.transaction.create.useMutation({
    onSuccess: async () => {
      // Refetch rather than patch the cache: a back-dated transaction sorts
      // into the middle of the register, and every running balance at or after
      // it shifts.
      await invalidateRegister();
      setTimeout(
        () =>
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          }),
        0
      );
      onSaveSuccess?.();
    },
  });

  const transactions = data?.transactions ?? [];

  const categoryOptions =
    categoryGroups
      ?.filter((g) => !g.isSystem)
      .flatMap((g) =>
        g.categories.map((c) => ({ id: c.id, label: `${g.name}: ${c.name}` }))
      ) ?? [];

  function cycleCleared(current: string, id: number) {
    const next =
      current === "Uncleared"
        ? "Cleared"
        : current === "Cleared"
        ? "Reconciled"
        : "Uncleared";
    setClearedMutation.mutate({
      id,
      cleared: next as "Uncleared" | "Cleared" | "Reconciled",
    });
  }

  function createTransaction(fields: {
    date: Date | undefined;
    payeeId: number | null;
    payeeName: string;
    categoryId: number | null;
    memo: string;
    outflow: string;
    inflow: string;
  }) {
    if (!fields.date) return;
    const dateStr = format(fields.date, "yyyy-MM-dd");
    const outflowVal = parseFloat(fields.outflow);
    const inflowVal = parseFloat(fields.inflow);
    const hasOutflow = !isNaN(outflowVal) && outflowVal > 0;
    const hasInflow = !isNaN(inflowVal) && inflowVal > 0;
    if (!hasOutflow && !hasInflow) return;
    if (hasOutflow && hasInflow) return;

    const amount = hasInflow ? inflowVal : -outflowVal;

    createMutation.mutate({
      budgetId,
      accountId,
      payeeId: fields.payeeId,
      payeeName: fields.payeeId ? undefined : fields.payeeName || undefined,
      categoryId: fields.categoryId,
      amount,
      date: dateStr,
      memo: fields.memo || undefined,
      cleared: "Uncleared",
      accepted: true,
    });
  }

  return {
    account,
    transactions,
    balance: data?.balance ?? 0,
    total: data?.total ?? 0,
    hasMore: data?.hasMore ?? false,
    loadOlder: () => setLimit((n) => n + PAGE_SIZE),
    isLoadingMore: isFetching && !isLoading,
    payeeList,
    categoryOptions,
    isLoading,
    cycleCleared,
    createTransaction,
    isSaving: createMutation.isPending,
  };
}

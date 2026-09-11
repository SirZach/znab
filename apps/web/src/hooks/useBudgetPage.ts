import { trpc } from "@/trpc";

export function useBudgetPage({
  budgetId,
  month,
}: {
  budgetId: number;
  month: string;
}) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.budget.monthBudget.useQuery({ budgetId, month });

  // Budgeting in one month feeds every later month's carry-forward, so every
  // cached month is stale after any of these, not just the one that was edited.
  // The Quick Budget figures are derived from the same rows, so they go too.
  const invalidateBudget = () =>
    Promise.all([
      utils.budget.monthBudget.invalidate(),
      utils.budget.quickBudget.invalidate(),
    ]);

  const setMutation = trpc.budget.setBudgeted.useMutation({
    onSuccess: invalidateBudget,
  });
  const moveMutation = trpc.budget.moveMoney.useMutation({
    onSuccess: invalidateBudget,
  });
  const overspendingMutation = trpc.budget.setOverspendingHandling.useMutation({
    onSuccess: invalidateBudget,
  });

  const summary = data?.summary;
  const visibleGroups = (data?.groups ?? []).filter((g) => !g.isSystem && !g.deletedAt);

  function setBudgeted(args: {
    budgetId: number;
    categoryId: number;
    month: string;
    budgeted: number;
  }) {
    setMutation.mutate(args);
  }

  function moveMoney(args: {
    fromCategoryId: number;
    toCategoryId: number;
    amount: number;
  }) {
    moveMutation.mutate({ budgetId, month, ...args });
  }

  function setConfined(categoryId: number, confined: boolean) {
    overspendingMutation.mutate({ budgetId, month, categoryId, confined });
  }

  return {
    visibleGroups,
    summary,
    isLoading,
    setBudgeted,
    moveMoney,
    setConfined,
    isMoving: moveMutation.isPending,
    moveError: moveMutation.error?.message ?? null,
  };
}

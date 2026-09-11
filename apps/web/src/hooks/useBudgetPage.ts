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

  const setMutation = trpc.budget.setBudgeted.useMutation({
    // Budgeting in one month feeds every later month's carry-forward, so every
    // cached month is stale, not just the one that was edited.
    onSuccess: () => utils.budget.monthBudget.invalidate(),
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

  return { visibleGroups, summary, isLoading, setBudgeted };
}

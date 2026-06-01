import { trpc } from "@/trpc";

export function useBudgetPage({
  budgetId,
  month,
}: {
  budgetId: number;
  month: string;
}) {
  const { data, isLoading } = trpc.budget.monthBudget.useQuery({ budgetId, month });

  const setMutation = trpc.budget.setBudgeted.useMutation();

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

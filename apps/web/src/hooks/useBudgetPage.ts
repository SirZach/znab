import { trpc } from "@/trpc";

export function useBudgetPage({
  budgetId,
  month,
}: {
  budgetId: number;
  month: string;
}) {
  const { data: groups, isLoading } = trpc.budget.monthData.useQuery({
    budgetId,
    month,
  });

  const setMutation = trpc.budget.setBudgeted.useMutation();

  const visibleGroups = (groups ?? []).filter((g) => !g.isSystem && !g.deletedAt);

  function setBudgeted(args: {
    budgetId: number;
    categoryId: number;
    month: string;
    budgeted: number;
  }) {
    setMutation.mutate(args);
  }

  return { visibleGroups, isLoading, setBudgeted };
}

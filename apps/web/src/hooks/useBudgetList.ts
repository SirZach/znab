import { trpc } from "@/trpc";

export function useBudgetList() {
  const { data: budgets, isLoading } = trpc.budget.list.useQuery();
  return { budgets, isLoading };
}

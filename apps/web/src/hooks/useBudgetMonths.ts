import { trpc } from "@/trpc";

export function useBudgetMonths({ budgetId }: { budgetId: number }) {
  const { data: availableMonths } = trpc.budget.months.useQuery({ budgetId });
  return { availableMonths: availableMonths ?? [] };
}

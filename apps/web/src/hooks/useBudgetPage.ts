import type { inferRouterOutputs } from "@trpc/server";
import type { GoalType } from "@znab/shared";
import { invalidateBudgeting } from "@/lib/invalidate";
import { trpc, type AppRouter } from "@/trpc";

type MonthBudget = inferRouterOutputs<AppRouter>["budget"]["monthBudget"];
export type BudgetGroup = MonthBudget["groups"][number];
export type BudgetCategory = BudgetGroup["categories"][number];
export type HiddenCategory = MonthBudget["hidden"][number];

export function useBudgetPage({
  budgetId,
  month,
}: {
  budgetId: number;
  month: string;
}) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.budget.monthBudget.useQuery({ budgetId, month });

  const invalidateBudget = () => invalidateBudgeting(utils);

  const setMutation = trpc.budget.setBudgeted.useMutation({
    onSuccess: invalidateBudget,
  });
  const moveMutation = trpc.budget.moveMoney.useMutation({
    onSuccess: invalidateBudget,
  });
  const overspendingMutation = trpc.budget.setOverspendingHandling.useMutation({
    onSuccess: invalidateBudget,
  });
  const goalMutation = trpc.budget.setCategoryGoal.useMutation({
    onSuccess: invalidateBudget,
  });
  const hiddenMutation = trpc.budget.setCategoryHidden.useMutation({
    onSuccess: invalidateBudget,
  });

  const summary = data?.summary;
  const visibleGroups = (data?.groups ?? []).filter((g) => !g.isSystem && !g.deletedAt);

  function setBudgeted(categoryId: number, budgeted: number) {
    setMutation.mutate({ budgetId, categoryId, month, budgeted });
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

  function setCategoryGoal(
    categoryId: number,
    goal: {
      goalType: GoalType | null;
      target?: number;
      targetMonth?: string;
    }
  ) {
    goalMutation.mutate({ budgetId, categoryId, ...goal });
  }

  function setCategoryHidden(categoryId: number, hidden: boolean) {
    hiddenMutation.mutate({ budgetId, categoryId, hidden });
  }

  return {
    visibleGroups,
    hidden: data?.hidden ?? [],
    summary,
    isLoading,
    setBudgeted,
    moveMoney,
    setConfined,
    setCategoryGoal,
    setCategoryHidden,
    isMoving: moveMutation.isPending,
    moveError: moveMutation.error?.message ?? null,
    goalError: goalMutation.error?.message ?? null,
  };
}

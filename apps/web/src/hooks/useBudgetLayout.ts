import type { QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { useUserStore } from "@/store/user";

export function useBudgetLayout({
  budgetId,
  queryClient,
}: {
  budgetId: number;
  queryClient: QueryClient;
}) {
  const clearUser = useUserStore((s) => s.clearUser);
  const navigate = useNavigate();

  const { data: budget } = trpc.budget.byId.useQuery({ budgetId });
  const { data: accounts } = trpc.account.list.useQuery({ budgetId });

  const onBudgetAccounts = accounts?.filter((a) => a.onBudget) ?? [];
  const trackingAccounts = accounts?.filter((a) => !a.onBudget) ?? [];

  function handleSignOut() {
    queryClient.clear();
    clearUser();
    navigate({ to: "/" });
  }

  return { budget, onBudgetAccounts, trackingAccounts, handleSignOut };
}

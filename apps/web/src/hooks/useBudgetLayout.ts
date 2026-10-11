import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { groupAccounts } from "@/lib/accounts";
import { useUserStore } from "@/store/user";

export function useBudgetLayout({ budgetId }: { budgetId: number }) {
  const queryClient = useQueryClient();
  const clearUser = useUserStore((s) => s.clearUser);
  const navigate = useNavigate();

  const { data: budget } = trpc.budget.byId.useQuery({ budgetId });
  const { data: accounts } = trpc.account.list.useQuery({ budgetId });

  const { onBudgetAccounts, trackingAccounts, closedAccounts } = groupAccounts(
    accounts ?? []
  );

  function handleSignOut() {
    queryClient.clear();
    clearUser();
    navigate({ to: "/" });
  }

  return {
    budget,
    onBudgetAccounts,
    trackingAccounts,
    closedAccounts,
    handleSignOut,
  };
}

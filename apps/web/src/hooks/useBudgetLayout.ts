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

  // A hidden account is one YNAB 4 calls closed: paid off or emptied, kept for
  // its history. It belongs in its own section rather than mixed in with the
  // accounts still in use.
  const live = accounts?.filter((a) => !a.hidden) ?? [];
  const onBudgetAccounts = live.filter((a) => a.onBudget);
  const trackingAccounts = live.filter((a) => !a.onBudget);
  const closedAccounts = accounts?.filter((a) => a.hidden) ?? [];

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

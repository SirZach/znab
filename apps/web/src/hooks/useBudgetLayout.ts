import type { QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { useUserStore } from "@/store/user";

/**
 * The three sections a budget's accounts are read in. A hidden account is one
 * YNAB 4 calls closed: paid off or emptied, kept for its history. It belongs in
 * its own section rather than mixed in with the accounts still in use.
 *
 * Shared with the manage screen so the sidebar and it cannot disagree about
 * where an account belongs.
 */
export function groupAccounts<T extends { onBudget: boolean; hidden: boolean }>(
  accounts: T[]
) {
  const live = accounts.filter((a) => !a.hidden);
  return {
    onBudgetAccounts: live.filter((a) => a.onBudget),
    trackingAccounts: live.filter((a) => !a.onBudget),
    closedAccounts: accounts.filter((a) => a.hidden),
  };
}

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

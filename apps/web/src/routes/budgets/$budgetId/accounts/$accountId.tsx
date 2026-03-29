import { createFileRoute } from "@tanstack/react-router";
import { accountRegisterSearchSchema } from "@znab/shared";
import { trpc } from "@/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CheckCircle2, Circle, Lock } from "lucide-react";

export const Route = createFileRoute(
  "/budgets/$budgetId/accounts/$accountId"
)({
  validateSearch: accountRegisterSearchSchema,
  component: AccountRegisterPage,
});

function AccountRegisterPage() {
  const { budgetId, accountId } = Route.useParams();
  const { cleared, q } = Route.useSearch();

  const { data: transactions, isLoading } = trpc.account.transactions.useQuery({
    budgetId: Number(budgetId),
    accountId: Number(accountId),
    cleared: cleared as "all" | "Uncleared" | "Cleared" | "Reconciled",
    q,
  });

  const utils = trpc.useUtils();
  const setClearedMutation = trpc.transaction.setClearedStatus.useMutation({
    onSuccess: () => utils.account.transactions.invalidate(),
  });

  const { data: accounts } = trpc.account.list.useQuery({ budgetId: Number(budgetId) });
  const account = accounts?.find((a) => a.id === Number(accountId));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading transactions…</p>
      </div>
    );
  }

  // Compute running balance (newest first → reverse for running total)
  const sorted = [...(transactions ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let running = 0;
  const withBalance = sorted.map((t) => {
    running += parseFloat(t.amount);
    return { ...t, runningBalance: running };
  });
  withBalance.reverse();

  function cycleCleared(current: string, id: number) {
    const next =
      current === "Uncleared"
        ? "Cleared"
        : current === "Cleared"
        ? "Reconciled"
        : "Uncleared";
    setClearedMutation.mutate({
      id,
      cleared: next as "Uncleared" | "Cleared" | "Reconciled",
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-xl font-semibold">{account?.name ?? "Account"}</h2>
          <p className="text-sm text-muted-foreground capitalize">{account?.accountType}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Current balance</p>
          <p className="text-lg font-semibold">
            {withBalance[0]
              ? formatCurrency(withBalance[0].runningBalance)
              : "$0.00"}
          </p>
        </div>
      </div>

      {/* Transaction list */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr className="text-muted-foreground">
              <th className="text-left px-6 py-2 font-medium w-28">Date</th>
              <th className="text-left px-4 py-2 font-medium">Payee</th>
              <th className="text-left px-4 py-2 font-medium">Category</th>
              <th className="text-left px-4 py-2 font-medium">Memo</th>
              <th className="text-right px-4 py-2 font-medium w-24">Outflow</th>
              <th className="text-right px-4 py-2 font-medium w-24">Inflow</th>
              <th className="text-center px-2 py-2 font-medium w-10">C</th>
              <th className="text-right px-6 py-2 font-medium w-28">Balance</th>
            </tr>
          </thead>
          <tbody>
            {withBalance.map((txn) => {
              const amount = parseFloat(txn.amount);
              const isInflow = amount > 0;

              return (
                <tr
                  key={txn.id}
                  className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                >
                  <td className="px-6 py-2 text-muted-foreground tabular-nums">
                    {formatDate(txn.date)}
                  </td>
                  <td className="px-4 py-2">{txn.payee?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {txn.isSplit
                      ? "Split"
                      : txn.category?.name ?? txn.categoryYnabId?.split("/").pop() ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-48">
                    {txn.memo ?? ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {!isInflow ? formatCurrency(Math.abs(amount)) : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-500">
                    {isInflow ? formatCurrency(amount) : ""}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => cycleCleared(txn.cleared, txn.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={txn.cleared}
                    >
                      {txn.cleared === "Reconciled" ? (
                        <Lock size={14} className="text-primary" />
                      ) : txn.cleared === "Cleared" ? (
                        <CheckCircle2 size={14} className="text-green-500" />
                      ) : (
                        <Circle size={14} />
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-2 text-right tabular-nums font-medium">
                    {formatCurrency(txn.runningBalance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {withBalance.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">No transactions found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

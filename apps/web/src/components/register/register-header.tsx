import { Button } from "@/components/ui/button";
import { AccountBalances } from "@/components/register/account-balances";
import type { RegisterLookups } from "@/hooks/useRegisterLookups";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * The account's name, type and last reconciliation, with its balances and the
 * way into reconciling. Not `PageHeader`: its subtitle is capitalised and a
 * third line sits under it.
 */
export function RegisterHeader({
  account,
  clearedBalance,
  unclearedBalance,
  balance,
  onReconcile,
}: {
  account: RegisterLookups["account"];
  clearedBalance: number;
  unclearedBalance: number;
  balance: number;
  /** Absent while a reconciliation is already under way. */
  onReconcile?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
      <div>
        <h2 className="text-xl font-semibold">{account?.name ?? "Account"}</h2>
        <p className="text-sm text-muted-foreground capitalize">{account?.accountType}</p>
        <p className="text-xs text-muted-foreground">
          {account?.lastReconciledDate
            ? `Last reconciled ${formatDate(account.lastReconciledDate)} at ${formatCurrency(
                account.lastReconciledBalance
              )}`
            : "Never reconciled"}
        </p>
      </div>
      <div className="flex items-end gap-6">
        <AccountBalances cleared={clearedBalance} uncleared={unclearedBalance} working={balance} />
        {onReconcile && (
          <Button variant="outline" size="sm" onClick={onReconcile}>
            Reconcile
          </Button>
        )}
      </div>
    </div>
  );
}

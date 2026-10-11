import { Lock, Tag, Wand2 } from "lucide-react";
import { InlineName } from "@/components/common/inline-name";
import type { ManagedPayee } from "@/hooks/usePayees";
import { TRANSFER_NOTE, autofillAmount, hasAutofill, renameRulesTitle } from "@/lib/payees";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

/** One payee in the manage list. Clicking the row inspects it; clicking the name renames it. */
export function PayeeRow({
  payee,
  inspected,
  checked,
  editing,
  onInspect,
  onToggleChecked,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: {
  payee: ManagedPayee;
  inspected: boolean;
  checked: boolean;
  editing: boolean;
  onInspect: () => void;
  onToggleChecked: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
}) {
  const isTransfer = payee.targetAccountId !== null;
  const amount = autofillAmount(payee);
  return (
    <tr
      onClick={onInspect}
      aria-selected={inspected}
      className={cn(
        "border-b border-border/50 cursor-pointer transition-colors",
        inspected ? "bg-accent/60" : "hover:bg-accent/30"
      )}
    >
      <td className="px-6 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${payee.name}`}
          disabled={isTransfer}
          title={isTransfer ? TRANSFER_NOTE : undefined}
          checked={checked}
          onChange={onToggleChecked}
        />
      </td>

      <td className="px-2 py-2">
        {isTransfer && !editing ? (
          <span title={TRANSFER_NOTE} className="flex items-center gap-1.5 text-muted-foreground">
            <Lock size={12} className="shrink-0" />
            {payee.name}
          </span>
        ) : (
          <InlineName
            name={payee.name}
            editing={editing}
            aria-label="Payee name"
            onEdit={onStartRename}
            onCommit={onCommitRename}
            onCancel={onCancelRename}
          />
        )}
        {!payee.enabled && <span className="ml-2 text-xs text-muted-foreground">disabled</span>}
      </td>

      <td className="px-2 py-2">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {hasAutofill(payee) && (
            <span
              title={amount === null ? "Has autofill defaults" : `Autofills ${formatCurrency(amount)}`}
            >
              <Wand2 size={13} />
            </span>
          )}
          {payee.renameRules.length > 0 && (
            <span title={renameRulesTitle(payee.renameRules.length)}>
              <Tag size={13} />
            </span>
          )}
        </span>
      </td>

      <td className="text-right px-4 py-2 tabular-nums text-muted-foreground">
        {payee.transactionCount}
      </td>
      <td className="text-right px-6 py-2 tabular-nums text-muted-foreground">
        {payee.lastUsed ? formatDate(payee.lastUsed) : "Never"}
      </td>
    </tr>
  );
}

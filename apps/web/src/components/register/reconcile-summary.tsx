import { X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/** What the last reconciliation did, said once and dismissable. */
export function ReconcileSummary({
  result,
  onDismiss,
}: {
  result: { reconciledCount: number; adjustmentAmount: number | null };
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-6 py-2 border-b border-border bg-accent/20">
      <p className="text-xs text-muted-foreground">
        Reconciled {result.reconciledCount}{" "}
        {result.reconciledCount === 1 ? "transaction" : "transactions"}.
        {result.adjustmentAmount !== null &&
          ` A balance adjustment of ${formatCurrency(result.adjustmentAmount)} was entered.`}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

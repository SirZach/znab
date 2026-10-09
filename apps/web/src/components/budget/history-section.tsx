import { formatCurrency } from "@/lib/utils";
import { SidePanelSection } from "@/components/common/side-panel-section";

/**
 * The last twelve months of spending in this category, one bar a month on a
 * shared scale.
 */
export function HistorySection({
  history,
}: {
  history: Array<{ month: string; spent: number }> | undefined;
}) {
  if (!history || history.length === 0) return null;

  // never divide by zero on a category that has never moved
  const peak = Math.max(...history.map((h) => h.spent), 1);

  return (
    <SidePanelSection title="Spent in the last 12 months">
      <div className="space-y-1">
        {history.map((h) => (
          <div key={h.month} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
              {h.month}
            </span>
            <div className="flex-1 min-w-0 h-1.5 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-primary/70"
                style={{ width: `${(h.spent / peak) * 100}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {formatCurrency(h.spent)}
            </span>
          </div>
        ))}
      </div>
    </SidePanelSection>
  );
}

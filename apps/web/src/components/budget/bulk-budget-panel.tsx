import { useState } from "react";
import { X } from "lucide-react";
import { formatCurrency, parseAmountExpression } from "@/lib/utils";

/**
 * Shown in place of the single-category inspector when several categories are
 * selected, so a row of envelopes can be funded in one pass.
 */
export function BulkBudgetPanel({
  categories,
  onBudgetAll,
  onClear,
}: {
  categories: Array<{ id: number; name: string; groupName: string; budgeted: number }>;
  onBudgetAll: (amount: number) => void;
  onClear: () => void;
}) {
  const [amount, setAmount] = useState("");
  const parsed = parseAmountExpression(amount);
  const total = categories.reduce((sum, c) => sum + c.budgeted, 0);

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h3 className="font-semibold">{categories.length} categories selected</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(total)} budgeted between them
          </p>
        </div>
        <button
          onClick={onClear}
          aria-label="Clear selection"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <section className="px-4 py-3 border-b border-border">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Budget each of them
        </h4>
        <div className="flex gap-2">
          <input
            id="bulk-amount"
            type="text"
            inputMode="decimal"
            aria-label="Amount to budget to each selected category"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && parsed !== null) {
                onBudgetAll(parsed);
                setAmount("");
              }
            }}
            className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            disabled={parsed === null}
            onClick={() => {
              if (parsed === null) return;
              onBudgetAll(parsed);
              setAmount("");
            }}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Apply
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Sets every selected category to this amount. Arithmetic works here too.
        </p>
        <button
          onClick={() => onBudgetAll(0)}
          className="mt-2 w-full rounded border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          Set them all to zero
        </button>
      </section>

      <section className="px-4 py-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Selected
        </h4>
        <ul className="space-y-1">
          {categories.map((c) => (
            <li key={c.id} className="flex justify-between gap-2 text-sm">
              <span className="truncate text-muted-foreground">
                {c.groupName}: {c.name}
              </span>
              <span className="tabular-nums shrink-0">{formatCurrency(c.budgeted)}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

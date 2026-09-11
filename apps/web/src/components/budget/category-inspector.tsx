import { useState } from "react";
import { X } from "lucide-react";
import { trpc } from "@/trpc";
import { cn, formatCurrency, parseAmountExpression } from "@/lib/utils";

export type InspectedCategory = {
  id: number;
  name: string;
  groupName: string;
  budgeted: number;
  activity: number;
  available: number;
  overspendKind: "cash" | "credit" | null;
  confined: boolean;
};

export type MoveSource = { id: number; name: string; groupName: string; available: number };

/**
 * YNAB 4's right-hand panel for the selected category: where it stands this
 * month, the Quick Budget shortcuts, covering overspending from another
 * category, and whether overspending is confined here.
 */
export function CategoryInspector({
  budgetId,
  month,
  category,
  sources,
  onSetBudgeted,
  onMoveMoney,
  onSetConfined,
  isMoving,
  moveError,
  onClose,
}: {
  budgetId: number;
  month: string;
  category: InspectedCategory;
  sources: MoveSource[];
  onSetBudgeted: (amount: number) => void;
  onMoveMoney: (fromCategoryId: number, amount: number) => void;
  onSetConfined: (confined: boolean) => void;
  isMoving: boolean;
  moveError: string | null;
  onClose: () => void;
}) {
  const { data: quick } = trpc.budget.quickBudget.useQuery({
    budgetId,
    categoryId: category.id,
    month,
  });

  const shortfall = category.available < 0 ? -category.available : 0;
  const [fromId, setFromId] = useState<number | "">("");
  const [amount, setAmount] = useState("");

  // Offer the shortfall as the default amount, but let it be overridden.
  const amountValue = amount === "" ? (shortfall ? shortfall.toFixed(2) : "") : amount;
  const parsedAmount = parseAmountExpression(amountValue);
  const canMove = fromId !== "" && parsedAmount !== null && parsedAmount > 0 && !isMoving;

  const quickActions: Array<{ label: string; amount: number | undefined }> = [
    { label: "Budgeted last month", amount: quick?.budgetedLastMonth },
    { label: "Spent last month", amount: quick?.spentLastMonth },
    { label: "Average budgeted", amount: quick?.averageBudgeted },
    { label: "Average spent", amount: quick?.averageSpent },
    { label: "Balance to zero", amount: quick?.balanceToZero },
  ];

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{category.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{category.groupName}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Where the category stands */}
      <dl className="px-4 py-3 space-y-1.5 border-b border-border">
        <Row label="Budgeted" value={formatCurrency(category.budgeted)} />
        <Row
          label="Spent"
          value={category.activity !== 0 ? formatCurrency(category.activity) : "—"}
        />
        <Row
          label="Available"
          value={formatCurrency(category.available)}
          emphasis
          tone={
            category.available < 0
              ? category.overspendKind === "credit"
                ? "warn"
                : "danger"
              : category.available > 0
              ? "good"
              : undefined
          }
        />
        {category.available < 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            {category.overspendKind === "credit"
              ? "Overspent on credit. This carries as debt and does not reduce next month's To-be-Budgeted."
              : "Overspent in cash. This comes out of next month's To-be-Budgeted."}
          </p>
        )}
      </dl>

      {/* Quick Budget */}
      <section className="px-4 py-3 border-b border-border">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Quick Budget
        </h4>
        <div className="space-y-1">
          {quickActions.map((action) => (
            <button
              key={action.label}
              disabled={action.amount === undefined}
              onClick={() => action.amount !== undefined && onSetBudgeted(action.amount)}
              className="flex w-full items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-sm hover:border-primary hover:bg-accent disabled:opacity-50 transition-colors"
            >
              <span>{action.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {action.amount === undefined ? "…" : formatCurrency(action.amount)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Move money in from another category */}
      <section className="px-4 py-3 border-b border-border">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {shortfall > 0 ? "Cover overspending from" : "Move money from"}
        </h4>
        <div className="space-y-2">
          <select
            id={`move-from-${category.id}`}
            value={fromId}
            onChange={(e) => setFromId(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Choose a category…</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.groupName}: {s.name} ({formatCurrency(s.available)})
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              id={`move-amount-${category.id}`}
              type="text"
              inputMode="decimal"
              aria-label="Amount to move"
              placeholder="0.00"
              value={amountValue}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              disabled={!canMove}
              onClick={() => {
                if (fromId === "" || parsedAmount === null) return;
                onMoveMoney(fromId, parsedAmount);
                setAmount("");
                setFromId("");
              }}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isMoving ? "Moving…" : "Move"}
            </button>
          </div>

          {moveError && <p className="text-xs text-destructive">{moveError}</p>}
        </div>
      </section>

      {/* Overspending handling */}
      <section className="px-4 py-3">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            id={`confine-${category.id}`}
            type="checkbox"
            checked={category.confined}
            onChange={(e) => onSetConfined(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Confine overspending to this category
            <span className="block text-xs text-muted-foreground mt-0.5">
              Keeps a shortfall here instead of taking it out of next month's
              To-be-Budgeted.
            </span>
          </span>
        </label>
      </section>
    </aside>
  );
}

function Row({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "good" | "warn" | "danger";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          emphasis ? "text-base font-semibold" : "text-sm",
          tone === "good" && "text-green-600 dark:text-green-500",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

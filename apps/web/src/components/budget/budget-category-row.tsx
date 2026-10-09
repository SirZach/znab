import type { BudgetCategory } from "@/hooks/useBudgetPage";
import { cn, formatCurrency } from "@/lib/utils";
import { AvailablePill } from "./available-pill";
import { BudgetedCell } from "./budgeted-cell";
import { GoalDot } from "./goal-dot";
import { NAME_COL } from "./grid-styles";

/** One category's row in the budget grid. */
export function BudgetCategoryRow({
  cat,
  selected,
  isMobile,
  onSelect,
  onShowSpent,
  registerCell,
  onMoveFocus,
  onBudget,
}: {
  cat: BudgetCategory;
  selected: boolean;
  isMobile: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onShowSpent: () => void;
  registerCell: (id: number, el: HTMLInputElement | null) => void;
  onMoveFocus: (delta: number) => void;
  onBudget: (amount: number) => void;
}) {
  return (
    <tr
      onClick={onSelect}
      aria-selected={selected}
      className={cn(
        "border-b border-border/50 cursor-pointer transition-colors",
        selected ? "bg-accent/60" : "hover:bg-accent/30"
      )}
    >
      {/* Narrowed to what is left on a phone, where a long
          name is cut short rather than widening the page */}
      <td className={cn("px-3 pl-5 md:px-6 md:pl-10 py-2 max-md:max-w-0", NAME_COL)}>
        <span className="flex items-center gap-2">
          <span className="max-md:truncate">{cat.name}</span>
          {cat.goal && <GoalDot goal={cat.goal} />}
        </span>
      </td>
      <td className="text-right px-2 md:px-4 py-2">
        {/* Plain text on a phone, so tapping the row opens
            the inspector instead of the keyboard */}
        {isMobile ? (
          <span className="tabular-nums">{formatCurrency(cat.budgeted)}</span>
        ) : (
          <BudgetedCell
            categoryId={cat.id}
            value={cat.budgeted}
            registerRef={registerCell}
            onMove={onMoveFocus}
            onSave={onBudget}
          />
        )}
      </td>
      <td className="text-right px-2 md:px-4 py-2 text-muted-foreground tabular-nums">
        <button
          type="button"
          onClick={(e) => {
            // Opens this category alone, on its transactions,
            // rather than joining a selection.
            e.stopPropagation();
            onShowSpent();
          }}
          title="Show the transactions behind this"
          className="tabular-nums hover:text-foreground hover:underline"
        >
          {formatCurrency(cat.activity)}
        </button>
      </td>
      <td className="text-right px-3 md:px-6 py-2">
        <AvailablePill amount={cat.available} overspendKind={cat.overspendKind} />
      </td>
    </tr>
  );
}

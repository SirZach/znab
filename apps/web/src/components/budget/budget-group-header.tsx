import { ChevronDown } from "lucide-react";
import { groupTotals } from "@/lib/budget-grid";
import { cn, formatCurrency } from "@/lib/utils";
import { NAME_COL } from "./grid-styles";

/** A category group's header row, with the group's own totals. */
export function BudgetGroupHeader({
  name,
  categories,
  collapsed,
  onToggle,
}: {
  name: string;
  categories: { budgeted: number; activity: number; available: number }[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const totals = groupTotals(categories);

  return (
    <tr className="bg-muted/30 border-b border-border/50">
      <td className={cn("px-3 md:px-6 py-2 max-md:max-w-0", NAME_COL)}>
        <div className="flex max-w-full items-center gap-1.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
            onClick={onToggle}
            className="shrink-0 hover:text-foreground transition-colors"
          >
            <ChevronDown size={13} className={cn("transition-transform", collapsed && "-rotate-90")} />
          </button>
          <span className="max-md:truncate">{name}</span>
        </div>
      </td>
      <td className="text-right px-2 md:px-4 py-2 text-xs font-semibold tabular-nums text-muted-foreground">
        {formatCurrency(totals.budgeted)}
      </td>
      <td className="text-right px-2 md:px-4 py-2 text-xs font-semibold tabular-nums text-muted-foreground">
        {formatCurrency(totals.activity)}
      </td>
      <td className="text-right px-3 md:px-6 py-2 text-xs font-semibold tabular-nums text-muted-foreground">
        {formatCurrency(totals.available)}
      </td>
    </tr>
  );
}

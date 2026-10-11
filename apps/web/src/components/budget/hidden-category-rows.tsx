import { ChevronDown } from "lucide-react";
import type { HiddenCategory } from "@/hooks/useBudgetPage";
import { cn, formatCurrency } from "@/lib/utils";
import { NAME_COL } from "./grid-styles";

/**
 * Hidden categories, kept out of the group subtotals above but still
 * reachable, since their history belongs to past months.
 */
export function HiddenCategoryRows({
  hidden,
  open,
  onToggle,
  onUnhide,
}: {
  hidden: HiddenCategory[];
  open: boolean;
  onToggle: () => void;
  onUnhide: (categoryId: number) => void;
}) {
  return (
    <>
      <tr
        className="bg-muted/30 border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <td colSpan={4} className="px-3 md:px-6 py-2">
          <button
            type="button"
            aria-expanded={open}
            className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown size={13} className={cn("transition-transform", !open && "-rotate-90")} />
            Hidden Categories ({hidden.length})
          </button>
        </td>
      </tr>

      {open &&
        hidden.map((cat) => (
          <tr key={cat.id} className="border-b border-border/50 text-muted-foreground">
            <td className={cn("px-3 pl-5 md:px-6 md:pl-10 py-2 max-md:max-w-0", NAME_COL)}>
              <span className="flex items-baseline gap-2">
                <span className="truncate">{cat.name}</span>
                <span className="text-xs opacity-70">{cat.groupName}</span>
              </span>
            </td>
            <td className="text-right px-2 md:px-4 py-2 tabular-nums">
              {formatCurrency(cat.budgeted)}
            </td>
            <td className="text-right px-2 md:px-4 py-2 tabular-nums">
              {formatCurrency(cat.activity)}
            </td>
            <td className="text-right px-3 md:px-6 py-2">
              <span className="flex items-center justify-end gap-2">
                <span className="tabular-nums">{formatCurrency(cat.available)}</span>
                <button
                  type="button"
                  onClick={() => onUnhide(cat.id)}
                  className="text-xs px-1.5 py-0.5 rounded border border-border hover:text-foreground hover:bg-accent transition-colors"
                >
                  Unhide
                </button>
              </span>
            </td>
          </tr>
        ))}
    </>
  );
}

import { ChevronDown, ChevronUp } from "lucide-react";
import type { RegisterSort, SortDirection } from "@znab/shared";
import { cn } from "@/lib/utils";

/**
 * A register column header that can be sorted by.
 *
 * Clicking the column already sorted turns it round; clicking another starts it
 * off ascending, except for the date, which starts newest first because asking
 * to sort a ledger by date almost always means wanting to see the recent end.
 */
export function SortHeader({
  column,
  label,
  sort,
  dir,
  align = "left",
  className,
  onSort,
}: {
  column: RegisterSort;
  label: string;
  sort: RegisterSort;
  dir: SortDirection;
  align?: "left" | "right" | "center";
  className?: string;
  onSort: (column: RegisterSort, dir: SortDirection) => void;
}) {
  const active = sort === column;
  const next: SortDirection = active
    ? dir === "asc"
      ? "desc"
      : "asc"
    : column === "date"
      ? "desc"
      : "asc";

  return (
    <th
      className={cn(
        "py-2 font-medium",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className
      )}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column, next)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          active && "text-foreground",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        {active &&
          (dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    </th>
  );
}

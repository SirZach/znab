import { ChevronDown, ChevronUp } from "lucide-react";
import type { RegisterSort, SortDirection } from "@znab/shared";
import { nextSortDirection } from "@/lib/register-sort";
import { cn } from "@/lib/utils";

/**
 * A register column header that can be sorted by. The direction a click asks
 * for is `nextSortDirection`, and `onSort` is handed it to apply as given.
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
  const next = nextSortDirection(column, sort, dir);

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

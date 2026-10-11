import type { RegisterSort, SortDirection } from "@znab/shared";

/**
 * The direction a click on a register column header asks for. Clicking the
 * column already sorted turns it round; clicking another starts it off
 * ascending, except for the date, which starts newest first because asking to
 * sort a ledger by date almost always means wanting to see the recent end.
 */
export function nextSortDirection(
  column: RegisterSort,
  sort: RegisterSort,
  dir: SortDirection
): SortDirection {
  if (column === sort) return dir === "asc" ? "desc" : "asc";
  return column === "date" ? "desc" : "asc";
}

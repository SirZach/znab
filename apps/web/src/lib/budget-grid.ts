import { addMonths, format, parseISO, subMonths } from "date-fns";
import type { OverspendKind } from "@znab/shared";
import { dateToMonthParam, formatCurrency } from "@/lib/utils";

type Category = { id: number; deletedAt?: unknown };
type Group<C extends Category> = { id: number; name: string; categories: C[] };
type Amounts = { budgeted: number; activity: number; available: number };

/** A group's categories that still exist. */
export function liveCategories<C extends Category>(categories: C[]): C[] {
  return categories.filter((c) => !c.deletedAt);
}

/**
 * Every category row on screen, in the order it appears. Arrow keys and
 * shift-click ranges both read this, so they agree on what "next" means and
 * neither steps into a collapsed group.
 */
export function visibleCategoryIds<C extends Category>(
  groups: Group<C>[],
  collapsed: ReadonlySet<number>
): number[] {
  return groups.flatMap((g) => (collapsed.has(g.id) ? [] : liveCategories(g.categories).map((c) => c.id)));
}

/** A group's own Budgeted, Spent and Available, summed from its rows. */
export function groupTotals(categories: Amounts[]): Amounts {
  return categories.reduce(
    (acc, c) => ({
      budgeted: acc.budgeted + c.budgeted,
      activity: acc.activity + c.activity,
      available: acc.available + c.available,
    }),
    { budgeted: 0, activity: 0, available: 0 }
  );
}

/** One category with the name of the group it sits in, or undefined. */
export function findCategory<C extends Category>(groups: Group<C>[], id: number | null) {
  return groups
    .flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name })))
    .find((c) => c.id === id);
}

/** The categories money can be moved to or from: every live one but `excludeId`. */
export function moveSources<C extends Category & { name: string; available: number }>(
  groups: Group<C>[],
  excludeId: number | null
) {
  return groups.flatMap((g) =>
    g.categories
      .filter((c) => c.id !== excludeId && !c.deletedAt)
      .map((c) => ({ id: c.id, name: c.name, groupName: g.name, available: c.available }))
  );
}

/** The selected categories as the bulk panel lists them, in grid order. */
export function bulkRows<C extends Category & { name: string; budgeted: number }>(
  groups: Group<C>[],
  selectedIds: ReadonlySet<number>
) {
  return groups.flatMap((g) =>
    g.categories
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, groupName: g.name, budgeted: c.budgeted }))
  );
}

/** Months ("YYYY-MM-01") grouped by year, newest year first. */
export function monthsByYear(months: string[]): [string, string[]][] {
  const byYear = months.reduce<Record<string, string[]>>((acc, m) => {
    const year = m.slice(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year]!.push(m);
    return acc;
  }, {});
  return Object.entries(byYear).sort(([a], [b]) => Number(b) - Number(a));
}

/** Labels and neighbouring month params for a month ("YYYY-MM-01"). */
export function monthNav(dbMonth: string) {
  const current = parseISO(dbMonth);
  return {
    prevMonth: dateToMonthParam(format(subMonths(current, 1), "yyyy-MM-01")),
    nextMonth: dateToMonthParam(format(addMonths(current, 1), "yyyy-MM-01")),
    displayMonth: format(current, "MMMM yyyy"),
    monthShort: format(current, "MMM"),
    prevShort: format(subMonths(current, 1), "MMM"),
  };
}

/**
 * A figure shown as what it takes from Available to Budget, so the summary row
 * literally sums to it, mirroring YNAB's header.
 */
export function formatDeduction(n: number): string {
  return n === 0 ? formatCurrency(0) : formatCurrency(-n);
}

/** Income shown with an explicit plus unless it is negative. */
export function formatIncome(n: number): string {
  return n < 0 ? formatCurrency(n) : `+${formatCurrency(n)}`;
}

export type AvailableStatus = "overspent" | "confined" | "funded" | "empty";

/**
 * Overspent comes out of next month's To be Budgeted; confined overspending
 * carries forward in the category instead.
 */
export function availableStatus(amount: number, overspendKind: OverspendKind): AvailableStatus {
  if (amount < 0) return overspendKind === "confined" ? "confined" : "overspent";
  return amount > 0 ? "funded" : "empty";
}

/** Stored collapsed group ids, or none when missing or unreadable. */
export function parseIdSet(raw: string | null): Set<number> {
  try {
    return raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
  } catch {
    return new Set<number>();
  }
}

import { trpc } from "@/trpc";
import type { ReportFiltersState } from "@/hooks/useReportFilters";
import { FilterPicker, type FilterOptionGroup } from "@/components/reports/filter-picker";
import { TimeframeToggle } from "@/components/reports/timeframe-toggle";

/**
 * The filters every report shares: its timeframe, and which accounts and
 * categories it counts. `accounts` says which accounts a report can count at
 * all, since only budget accounts carry spending; leaving it or `categories`
 * out leaves that picker off.
 */
export function ReportFilters({
  budgetId,
  filters,
  accounts,
  categories = false,
}: {
  budgetId: number;
  filters: ReportFiltersState;
  accounts?: "budget" | "all";
  categories?: boolean;
}) {
  const accountList = trpc.account.list.useQuery({ budgetId }, { enabled: accounts !== undefined });
  const categoryList = trpc.category.list.useQuery({ budgetId }, { enabled: categories });

  const offered = (accountList.data ?? []).filter((a) => accounts === "all" || a.onBudget);
  const accountGroups: FilterOptionGroup[] = [
    { heading: "Budget accounts", options: offered.filter((a) => a.onBudget && !a.hidden) },
    { heading: "Tracking accounts", options: offered.filter((a) => !a.onBudget && !a.hidden) },
    { heading: "Closed accounts", options: offered.filter((a) => a.hidden) },
  ]
    .map((g) => ({ heading: g.heading, options: g.options.map((a) => ({ id: a.id, label: a.name })) }))
    .filter((g) => g.options.length > 0);

  const categoryGroups: FilterOptionGroup[] = (categoryList.data ?? [])
    .filter((g) => !g.isSystem && g.categories.length > 0)
    .map((g) => ({ heading: g.name, options: g.categories.map((c) => ({ id: c.id, label: c.name })) }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TimeframeToggle value={filters.timeframe} onChange={filters.setTimeframe} />
      {accounts && accountGroups.length > 0 && (
        <FilterPicker
          noun="accounts"
          groups={accountGroups}
          selected={filters.accountIds}
          onChange={filters.setAccountIds}
        />
      )}
      {categories && categoryGroups.length > 0 && (
        <FilterPicker
          noun="categories"
          groups={categoryGroups}
          selected={filters.categoryIds}
          onChange={filters.setCategoryIds}
        />
      )}
    </div>
  );
}

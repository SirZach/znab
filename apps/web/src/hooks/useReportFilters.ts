import { getRouteApi } from "@tanstack/react-router";
import type { ReportTimeframe } from "@znab/shared";
import { selectsNothing } from "@/lib/report-filters";

const reportRoute = getRouteApi("/budgets/$budgetId/reports/$reportId");

/**
 * A report's timeframe, accounts and categories, kept in the URL so a filtered
 * view can be linked to and survives a reload. A filter left out of the URL
 * means all of it and an empty one none of it, in which case `nothingSelected`
 * holds and a report asks for nothing. `query` is the shape every report
 * procedure takes.
 */
export function useReportFilters(defaultTimeframe: ReportTimeframe) {
  const search = reportRoute.useSearch();
  const navigate = reportRoute.useNavigate();
  const timeframe = search.timeframe ?? defaultTimeframe;

  return {
    timeframe,
    accountIds: search.accounts,
    categoryIds: search.categories,
    nothingSelected: selectsNothing(search.accounts, search.categories),
    query: { timeframe, accountIds: search.accounts, categoryIds: search.categories },
    setTimeframe: (next: ReportTimeframe) =>
      navigate({ search: (prev) => ({ ...prev, timeframe: next }) }),
    setAccountIds: (accounts: number[] | undefined) =>
      navigate({ search: (prev) => ({ ...prev, accounts }) }),
    setCategoryIds: (categories: number[] | undefined) =>
      navigate({ search: (prev) => ({ ...prev, categories }) }),
  };
}

export type ReportFiltersState = ReturnType<typeof useReportFilters>;

/** What a report says instead of its chart when a filter has everything unticked. */
export const NOTHING_SELECTED = "Nothing is selected. Pick at least one account and category.";

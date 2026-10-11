import { getRouteApi } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { trpc } from "@/trpc";
import { formatCurrency } from "@/lib/utils";
import {
  CHART_COLORS,
  chartAxisProps,
  chartGridProps,
  chartTooltipStyle,
  formatCompactCurrency,
} from "@/lib/chart";
import { useReportFilters } from "@/hooks/useReportFilters";
import { MonthlySpendingReport } from "@/components/reports/monthly-spending-report";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

/**
 * How many categories the chart itself carries. A budget of this age runs to
 * dozens of them, and a bar chart of all of them is a wall rather than a
 * picture, so the chart takes the ones worth looking at and the table below
 * carries every one of them.
 */
const CHARTED = 15;

const reportRoute = getRouteApi("/budgets/$budgetId/reports/$reportId");

export function SpendingByCategoryReport({ budgetId }: { budgetId: number }) {
  const filters = useReportFilters("last12");
  // In the URL, so a category's own spending can be linked to and Back leaves it.
  const { category: categoryId } = reportRoute.useSearch();
  const navigate = reportRoute.useNavigate();
  const setCategoryId = (category: number | undefined) =>
    navigate({ search: (prev) => ({ ...prev, category }) });
  const { data, isLoading } = trpc.report.spendingByCategory.useQuery(
    { budgetId, ...filters.query },
    { enabled: categoryId === undefined }
  );
  const drilled = trpc.report.categorySpending.useQuery(
    // A category drilled into is the whole of its own category filter.
    { budgetId, categoryId: categoryId ?? 0, ...filters.query, categoryIds: undefined },
    { enabled: categoryId !== undefined }
  );

  if (categoryId !== undefined) {
    return (
      <MonthlySpendingReport
        title={drilled.data?.category ?? "Spending by Category"}
        subtitle={drilled.data?.group}
        subject="category"
        backLabel="All categories"
        onBack={() => setCategoryId(undefined)}
        color={CHART_COLORS.blue}
        filters={<ReportFilters budgetId={budgetId} filters={filters} accounts="budget" />}
        data={drilled.data}
        isLoading={drilled.isLoading}
        error={drilled.error}
      />
    );
  }

  const spending = data?.spending ?? [];
  const charted = spending.slice(0, CHARTED);

  return (
    <ReportLayout
      title="Spending by Category"
      filters={<ReportFilters budgetId={budgetId} filters={filters} accounts="budget" categories />}
      stats={
        <>
          <SummaryStat label="Total spent" value={formatCurrency(data?.total ?? 0)} />
          <SummaryStat label="Categories" value={spending.length} />
        </>
      }
      isLoading={isLoading}
      isEmpty={spending.length === 0}
      emptyMessage="Nothing was spent in this timeframe."
      messageClassName="h-60"
      footer={
        // Every category, since a chart makes the shape readable and the exact
        // figure unreadable, and the ones past the chart still cost money.
        spending.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-semibold py-2">Category</th>
                <th className="text-left font-semibold py-2">Group</th>
                <th className="text-right font-semibold py-2">Spent</th>
              </tr>
            </thead>
            <tbody>
              {spending.map((row) => (
                <tr key={row.categoryId} className="border-t border-border">
                  <td className="py-1.5">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => setCategoryId(row.categoryId)}
                    >
                      {row.category}
                    </button>
                  </td>
                  <td className="py-1.5 text-muted-foreground">{row.group}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    >
      <ResponsiveContainer width="100%" height={Math.max(240, charted.length * 30)}>
        <BarChart data={charted} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid {...chartGridProps} horizontal={false} />
          <XAxis type="number" tickFormatter={formatCompactCurrency} {...chartAxisProps} />
          <YAxis type="category" dataKey="category" width={140} {...chartAxisProps} />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), "Spent"]}
            contentStyle={chartTooltipStyle}
          />
          <Bar
            dataKey="spent"
            name="Spent"
            fill={CHART_COLORS.blue}
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(bar: { payload?: { categoryId: number } }) => {
              if (bar.payload) setCategoryId(bar.payload.categoryId);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ReportLayout>
  );
}

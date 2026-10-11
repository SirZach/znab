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
import { NOTHING_SELECTED, useReportFilters } from "@/hooks/useReportFilters";
import { MonthlySpendingReport } from "@/components/reports/monthly-spending-report";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

/**
 * How many payees the chart carries. There are over a thousand of them in this
 * budget against a few dozen categories, so the chart is the more aggressive
 * edit of the two and the table below still lists every one.
 */
const CHARTED = 15;

const reportRoute = getRouteApi("/budgets/$budgetId/reports/$reportId");

export function SpendingByPayeeReport({ budgetId }: { budgetId: number }) {
  const filters = useReportFilters("last12");
  const filterBar = <ReportFilters budgetId={budgetId} filters={filters} accounts="budget" categories />;
  // In the URL, so a payee's own spending can be linked to and Back leaves it.
  const { payee: payeeId } = reportRoute.useSearch();
  const navigate = reportRoute.useNavigate();
  const setPayeeId = (payee: number | undefined) => navigate({ search: (prev) => ({ ...prev, payee }) });
  const { data, isLoading } = trpc.report.spendingByPayee.useQuery(
    { budgetId, ...filters.query },
    { enabled: payeeId === undefined && !filters.nothingSelected }
  );
  const drilled = trpc.report.payeeSpending.useQuery(
    { budgetId, payeeId: payeeId ?? 0, ...filters.query },
    { enabled: payeeId !== undefined && !filters.nothingSelected }
  );

  if (payeeId !== undefined) {
    return (
      <MonthlySpendingReport
        title={drilled.data?.payee ?? "Spending by Payee"}
        subject="payee"
        backLabel="All payees"
        onBack={() => setPayeeId(undefined)}
        color={CHART_COLORS.purple}
        filters={filterBar}
        nothingSelected={filters.nothingSelected}
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
      title="Spending by Payee"
      filters={filterBar}
      stats={
        <>
          <SummaryStat label="Total of payees shown" value={formatCurrency(data?.total ?? 0)} />
          <SummaryStat label="Payees" value={spending.length} />
        </>
      }
      isLoading={isLoading}
      isEmpty={spending.length === 0}
      emptyMessage={filters.nothingSelected ? NOTHING_SELECTED : "Nobody was paid in this timeframe."}
      messageClassName="h-60"
      footer={
        spending.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-semibold py-2">Payee</th>
                <th className="text-right font-semibold py-2">Spent</th>
              </tr>
            </thead>
            <tbody>
              {spending.map((row) => (
                <tr key={row.payeeId} className="border-t border-border">
                  <td className="py-1.5">
                    <button type="button" className="hover:underline" onClick={() => setPayeeId(row.payeeId)}>
                      {row.payee}
                    </button>
                  </td>
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
          <YAxis type="category" dataKey="payee" width={160} {...chartAxisProps} />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), "Spent"]}
            contentStyle={chartTooltipStyle}
          />
          <Bar
            dataKey="spent"
            name="Spent"
            fill={CHART_COLORS.purple}
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(bar: { payload?: { payeeId: number } }) => {
              if (bar.payload) setPayeeId(bar.payload.payeeId);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ReportLayout>
  );
}

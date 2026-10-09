import { useState } from "react";
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
import type { ReportTimeframe } from "@znab/shared";
import { formatCurrency } from "@/lib/utils";
import {
  CHART_COLORS,
  chartAxisProps,
  chartGridProps,
  chartTooltipStyle,
  formatCompactCurrency,
} from "@/lib/chart";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

/**
 * How many categories the chart itself carries. A budget of this age runs to
 * dozens of them, and a bar chart of all of them is a wall rather than a
 * picture, so the chart takes the ones worth looking at and the table below
 * carries every one of them.
 */
const CHARTED = 15;

export function SpendingByCategoryReport({ budgetId }: { budgetId: number }) {
  const [timeframe, setTimeframe] = useState<ReportTimeframe>("last12");
  const { data, isLoading } = trpc.report.spendingByCategory.useQuery({
    budgetId,
    timeframe,
  });

  const spending = data?.spending ?? [];
  const charted = spending.slice(0, CHARTED);

  return (
    <ReportLayout
      title="Spending by Category"
      timeframe={timeframe}
      onTimeframeChange={setTimeframe}
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
                  <td className="py-1.5">{row.category}</td>
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
          <Bar dataKey="spent" name="Spent" fill={CHART_COLORS.blue} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ReportLayout>
  );
}

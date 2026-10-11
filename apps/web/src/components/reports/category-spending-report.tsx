import { ChevronLeft } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
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
  formatMonthTick,
  linearTrend,
} from "@/lib/chart";
import { Button } from "@/components/ui/button";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

/** One category out of Spending by Category, month by month over the same timeframe. */
export function CategorySpendingReport({
  budgetId,
  categoryId,
  timeframe,
  onTimeframeChange,
  onBack,
}: {
  budgetId: number;
  categoryId: number;
  timeframe: ReportTimeframe;
  onTimeframeChange: (timeframe: ReportTimeframe) => void;
  onBack: () => void;
}) {
  const { data, isLoading, error } = trpc.report.categorySpending.useQuery({
    budgetId,
    categoryId,
    timeframe,
  });

  const series = data?.series ?? [];
  const months = series.length;
  const trend = linearTrend(series.map((point) => point.spent));
  const charted = series.map((point, i) => ({ ...point, trend: trend[i] }));
  const trendPerMonth = months > 1 ? trend[1]! - trend[0]! : 0;

  return (
    <ReportLayout
      title={
        <span className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="All categories">
            <ChevronLeft />
          </Button>
          {data?.category ?? "Spending by Category"}
          {data && <span className="text-base font-normal text-muted-foreground">{data.group}</span>}
        </span>
      }
      timeframe={timeframe}
      onTimeframeChange={onTimeframeChange}
      stats={
        <>
          <SummaryStat label="Total spent" value={formatCurrency(data?.total ?? 0)} />
          <SummaryStat
            label="Monthly average"
            value={formatCurrency(months > 0 ? (data?.total ?? 0) / months : 0)}
          />
          <SummaryStat label="Trend" line value={`${trendPerMonth >= 0 ? "+" : ""}${formatCurrency(trendPerMonth)} / mo`} />
        </>
      }
      isLoading={isLoading}
      // A failed load, such as a link to a category since deleted, says why
      // rather than passing for a category that spent nothing.
      isEmpty={error !== null || series.every((point) => point.spent === 0)}
      emptyMessage={
        error ? `Could not load this category: ${error.message}` : "Nothing was spent in this category in this timeframe."
      }
    >
      <ResponsiveContainer width="100%" height={448}>
        <ComposedChart data={charted} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthTick}
            minTickGap={32}
            {...chartAxisProps}
          />
          <YAxis tickFormatter={formatCompactCurrency} {...chartAxisProps} width={64} />
          <Tooltip
            labelFormatter={(label) => formatMonthTick(String(label))}
            formatter={(value, name) => [formatCurrency(Number(value)), name]}
            contentStyle={chartTooltipStyle}
          />
          <Bar dataKey="spent" name="Spent" fill={CHART_COLORS.blue} radius={[2, 2, 0, 0]} />
          <Line
            type="linear"
            dataKey="trend"
            name="Trend"
            stroke={CHART_COLORS.line}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ReportLayout>
  );
}

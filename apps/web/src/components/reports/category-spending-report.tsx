import { ChevronLeft } from "lucide-react";
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
  formatMonthTick,
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
  const { data, isLoading } = trpc.report.categorySpending.useQuery({
    budgetId,
    categoryId,
    timeframe,
  });

  const series = data?.series ?? [];
  const months = series.length;

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
        </>
      }
      isLoading={isLoading}
      isEmpty={series.every((point) => point.spent === 0)}
      emptyMessage="Nothing was spent in this category in this timeframe."
    >
      <ResponsiveContainer width="100%" height={448}>
        <BarChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
            formatter={(value) => [formatCurrency(Number(value)), "Spent"]}
            contentStyle={chartTooltipStyle}
          />
          <Bar dataKey="spent" name="Spent" fill={CHART_COLORS.blue} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ReportLayout>
  );
}

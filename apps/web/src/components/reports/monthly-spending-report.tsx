import type { ReactNode } from "react";
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
import { NOTHING_SELECTED } from "@/hooks/useReportFilters";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

/**
 * One row of a spending report (a category, a payee) drilled into: its spend
 * month by month over the report's timeframe, with a trend line over the bars.
 */
export function MonthlySpendingReport({
  title,
  subtitle,
  subject,
  backLabel,
  onBack,
  color,
  filters,
  nothingSelected = false,
  data,
  isLoading,
  error,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** What was drilled into, for the messages: "category", "payee". */
  subject: string;
  backLabel: string;
  onBack: () => void;
  color: string;
  filters: ReactNode;
  /** A filter has everything unticked, so nothing was asked for. */
  nothingSelected?: boolean;
  data: { series: { month: string; spent: number }[]; total: number } | undefined;
  isLoading: boolean;
  error: { message: string } | null;
}) {
  const series = data?.series ?? [];
  const months = series.length;
  const trend = linearTrend(series.map((point) => point.spent));
  const charted = series.map((point, i) => ({ ...point, trend: trend[i] }));
  const trendPerMonth = months > 1 ? trend[1]! - trend[0]! : 0;

  return (
    <ReportLayout
      title={
        <span className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={backLabel}>
            <ChevronLeft />
          </Button>
          {title}
          {subtitle && <span className="text-base font-normal text-muted-foreground">{subtitle}</span>}
        </span>
      }
      filters={filters}
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
      // A failed load, such as a link to one since deleted, says why rather
      // than passing for one that spent nothing.
      isEmpty={error !== null || series.every((point) => point.spent === 0)}
      emptyMessage={
        nothingSelected
          ? NOTHING_SELECTED
          : error
            ? `Could not load this ${subject}: ${error.message}`
            : `Nothing was spent on this ${subject} in this timeframe.`
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
          <Bar dataKey="spent" name="Spent" fill={color} radius={[2, 2, 0, 0]} />
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

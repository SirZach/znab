import { useState } from "react";
import {
  ComposedChart,
  Area,
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
} from "@/lib/chart";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

const ASSETS_COLOR = CHART_COLORS.blue;
const DEBTS_COLOR = CHART_COLORS.red;

export function NetWorthReport({ budgetId }: { budgetId: number }) {
  const [timeframe, setTimeframe] = useState<ReportTimeframe>("all");
  const { data, isLoading } = trpc.report.netWorth.useQuery({ budgetId, timeframe });

  // Debts plotted below zero so assets fill above, debts below, line on top.
  const chartData = (data?.series ?? []).map((p) => ({ ...p, debtsNeg: -p.debts }));

  return (
    <ReportLayout
      title="Net Worth"
      timeframe={timeframe}
      onTimeframeChange={setTimeframe}
      stats={
        <>
          <SummaryStat
            label="Debts"
            color={DEBTS_COLOR}
            value={formatCurrency(data?.summary?.debts ?? 0)}
          />
          <SummaryStat
            label="Assets"
            color={ASSETS_COLOR}
            value={formatCurrency(data?.summary?.assets ?? 0)}
          />
          <SummaryStat
            label="Net Worth"
            value={formatCurrency(data?.summary?.netWorth ?? 0)}
            line
          />
        </>
      }
      isLoading={isLoading}
      isEmpty={chartData.length === 0}
      emptyMessage="No data for this budget."
    >
      <ResponsiveContainer width="100%" height={448}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthTick}
            minTickGap={48}
            {...chartAxisProps}
          />
          <YAxis tickFormatter={formatCompactCurrency} {...chartAxisProps} width={64} />
          <Tooltip
            labelFormatter={(label) => formatMonthTick(String(label))}
            formatter={(value, name) => [
              formatCurrency(name === "Debts" ? Math.abs(Number(value)) : Number(value)),
              name,
            ]}
            contentStyle={chartTooltipStyle}
          />
          <Area
            type="monotone"
            dataKey="assets"
            name="Assets"
            stroke={ASSETS_COLOR}
            fill={ASSETS_COLOR}
            fillOpacity={0.4}
            strokeWidth={1}
          />
          <Area
            type="monotone"
            dataKey="debtsNeg"
            name="Debts"
            stroke={DEBTS_COLOR}
            fill={DEBTS_COLOR}
            fillOpacity={0.4}
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="netWorth"
            name="Net Worth"
            stroke={CHART_COLORS.line}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ReportLayout>
  );
}

import { useState } from "react";
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
} from "@/lib/chart";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

const INCOME_COLOR = CHART_COLORS.green;
const EXPENSE_COLOR = CHART_COLORS.red;

export function IncomeVsExpenseReport({ budgetId }: { budgetId: number }) {
  const [timeframe, setTimeframe] = useState<ReportTimeframe>("last12");
  const { data, isLoading } = trpc.report.incomeVsExpense.useQuery({ budgetId, timeframe });

  const series = data?.series ?? [];

  return (
    <ReportLayout
      title="Income vs. Expenses"
      timeframe={timeframe}
      onTimeframeChange={setTimeframe}
      stats={
        <>
          <SummaryStat
            label="Income"
            color={INCOME_COLOR}
            value={formatCurrency(data?.summary.income ?? 0)}
          />
          <SummaryStat
            label="Expenses"
            color={EXPENSE_COLOR}
            value={formatCurrency(data?.summary.expense ?? 0)}
          />
          <SummaryStat label="Net" value={formatCurrency(data?.summary.net ?? 0)} line />
        </>
      }
      isLoading={isLoading}
      isEmpty={series.length === 0}
      emptyMessage="Nothing came in or went out in this timeframe."
    >
      <ResponsiveContainer width="100%" height={448}>
        <ComposedChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
          {/* Side by side rather than stacked, since the question this
              report answers is which of the two was bigger. */}
          <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[2, 2, 0, 0]} />
          <Bar dataKey="expense" name="Expenses" fill={EXPENSE_COLOR} radius={[2, 2, 0, 0]} />
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke={CHART_COLORS.line}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ReportLayout>
  );
}

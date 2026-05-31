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
import { formatCurrency, cn } from "@/lib/utils";

const TIMEFRAMES = [
  { value: "all", label: "All Dates" },
  { value: "thisYear", label: "This Year" },
  { value: "last12", label: "Last 12 Months" },
  { value: "last4Years", label: "Last 4 Years" },
] as const;

type Timeframe = (typeof TIMEFRAMES)[number]["value"];

const ASSETS_COLOR = "#9ecae1";
const DEBTS_COLOR = "#e15a4a";

/** "YYYY-MM" -> "MMM 'YY" */
function formatMonthTick(month: string): string {
  const [year = "", m = ""] = month.split("-");
  const label = new Date(Number(year), Number(m) - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
  return `${label} '${year.slice(2)}`;
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function NetWorthReport({ budgetId }: { budgetId: number }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const { data, isLoading } = trpc.report.netWorth.useQuery({ budgetId, timeframe });

  // Debts plotted below zero so assets fill above, debts below, line on top.
  const chartData = (data?.series ?? []).map((p) => ({ ...p, debtsNeg: -p.debts }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Net Worth</h2>
        <div className="flex rounded-lg border border-border p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                timeframe === tf.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary legend */}
      <div className="flex flex-wrap gap-10">
        <SummaryStat label="Debts" color={DEBTS_COLOR} value={data?.summary?.debts} />
        <SummaryStat label="Assets" color={ASSETS_COLOR} value={data?.summary?.assets} />
        <SummaryStat label="Net Worth" value={data?.summary?.netWorth} line />
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        {isLoading ? (
          <CenteredMessage>Loading…</CenteredMessage>
        ) : chartData.length === 0 ? (
          <CenteredMessage>No data for this budget.</CenteredMessage>
        ) : (
          <ResponsiveContainer width="100%" height={448}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthTick}
                minTickGap={48}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                stroke="hsl(var(--border))"
              />
              <YAxis
                tickFormatter={formatCompactCurrency}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                stroke="hsl(var(--border))"
                width={64}
              />
              <Tooltip
                labelFormatter={(label) => formatMonthTick(String(label))}
                formatter={(value, name) => [
                  formatCurrency(name === "Debts" ? Math.abs(Number(value)) : Number(value)),
                  name,
                ]}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
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
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  color,
  line,
}: {
  label: string;
  value: number | null | undefined;
  color?: string;
  line?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {line ? (
          <span className="inline-block h-0.5 w-4 bg-foreground" />
        ) : (
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: color }}
          />
        )}
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">
        {value != null ? formatCurrency(value) : "$0.00"}
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[28rem] items-center justify-center">
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

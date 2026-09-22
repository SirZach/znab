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
import { formatCurrency, cn } from "@/lib/utils";

const TIMEFRAMES = [
  { value: "all", label: "All Dates" },
  { value: "thisYear", label: "This Year" },
  { value: "last12", label: "Last 12 Months" },
  { value: "last4Years", label: "Last 4 Years" },
] as const;

type Timeframe = (typeof TIMEFRAMES)[number]["value"];

const BAR_COLOR = "#9ecae1";

/**
 * How many categories the chart itself carries. A budget of this age runs to
 * dozens of them, and a bar chart of all of them is a wall rather than a
 * picture, so the chart takes the ones worth looking at and the table below
 * carries every one of them.
 */
const CHARTED = 15;

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function SpendingByCategoryReport({ budgetId }: { budgetId: number }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("last12");
  const { data, isLoading } = trpc.report.spendingByCategory.useQuery({
    budgetId,
    timeframe,
  });

  const spending = data?.spending ?? [];
  const charted = spending.slice(0, CHARTED);

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Spending by Category</h2>
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

      <div className="flex flex-wrap gap-10">
        <div>
          <div className="text-sm text-muted-foreground">Total spent</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatCurrency(data?.total ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Categories</div>
          <div className="text-xl font-semibold tabular-nums">{spending.length}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {isLoading ? (
          <CenteredMessage>Loading…</CenteredMessage>
        ) : spending.length === 0 ? (
          <CenteredMessage>Nothing was spent in this timeframe.</CenteredMessage>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, charted.length * 30)}>
            <BarChart
              data={charted}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={formatCompactCurrency}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                stroke="hsl(var(--border))"
              />
              <YAxis
                type="category"
                dataKey="category"
                width={140}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                stroke="hsl(var(--border))"
              />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value)), "Spent"]}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="spent" name="Spent" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Every category, since a chart makes the shape readable and the exact
          figure unreadable, and the ones past the chart still cost money. */}
      {spending.length > 0 && (
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
      )}
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-60 items-center justify-center">
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

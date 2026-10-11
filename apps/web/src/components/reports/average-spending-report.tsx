import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { trpc } from "@/trpc";
import { formatCurrency } from "@/lib/utils";
import { CHART_COLORS, formatCompactCurrency, formatMonthTick } from "@/lib/chart";
import { NOTHING_SELECTED, useReportFilters } from "@/hooks/useReportFilters";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

/** As in Spending by Category: the chart takes the largest, the table takes all. */
const CHARTED = 15;

const chartConfig = {
  average: { label: "Per month", color: CHART_COLORS.blue },
} satisfies ChartConfig;

/**
 * What a typical month costs in each category: its spending over the complete
 * months of the timeframe, divided by how many there were. A category opens
 * its month by month spending in Spending by Category, under the same filters.
 */
export function AverageSpendingReport({ budgetId }: { budgetId: number }) {
  const filters = useReportFilters("last12");
  const { data, isLoading } = trpc.report.averageSpending.useQuery(
    { budgetId, ...filters.query },
    { enabled: !filters.nothingSelected }
  );

  const spending = data?.spending ?? [];
  const charted = spending.slice(0, CHARTED);
  const drillTo = (categoryId: number) => ({
    to: "/budgets/$budgetId/reports/$reportId" as const,
    params: { budgetId: String(budgetId), reportId: "spending" },
    search: {
      timeframe: filters.timeframe,
      accounts: filters.accountIds,
      categories: filters.categoryIds,
      category: categoryId,
    },
  });

  return (
    <ReportLayout
      title="Average Monthly Spending"
      filters={<ReportFilters budgetId={budgetId} filters={filters} accounts="budget" categories />}
      stats={
        <>
          <SummaryStat label="Typical month" value={formatCurrency(data?.average ?? 0)} />
          <SummaryStat
            label="Months averaged"
            value={
              data?.firstMonth
                ? `${data.months} since ${formatMonthTick(data.firstMonth)}`
                : (data?.months ?? 0)
            }
          />
          <SummaryStat label="Categories" value={spending.length} />
        </>
      }
      isLoading={isLoading}
      isEmpty={spending.length === 0}
      emptyMessage={
        filters.nothingSelected
          ? NOTHING_SELECTED
          : data?.months === 0
            ? "No complete month in this timeframe yet."
            : "Nothing was spent in this timeframe."
      }
      messageClassName="h-60"
      footer={
        spending.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Per month</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spending.map((row) => (
                <TableRow key={row.categoryId}>
                  <TableCell>
                    <Link {...drillTo(row.categoryId)} className="hover:underline">
                      {row.category}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.group}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.average)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      }
    >
      <ChartContainer
        config={chartConfig}
        className="aspect-auto w-full"
        style={{ height: Math.max(240, charted.length * 30) }}
      >
        <BarChart data={charted} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickFormatter={formatCompactCurrency} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="category" width={140} tickLine={false} axisLine={false} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className="font-mono tabular-nums">{formatCurrency(Number(value))} / mo</span>
                )}
              />
            }
          />
          <Bar dataKey="average" fill="var(--color-average)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartContainer>
    </ReportLayout>
  );
}

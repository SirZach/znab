import { getRouteApi } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { trpc } from "@/trpc";
import { formatCurrency } from "@/lib/utils";
import { CHART_COLORS, formatCompactCurrency } from "@/lib/chart";
import { type ComparisonPeriod, currentAnchor, rangeLabel, stepAnchor } from "@/lib/comparison";
import { NOTHING_SELECTED, useReportFilters } from "@/hooks/useReportFilters";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

const reportRoute = getRouteApi("/budgets/$budgetId/reports/$reportId");

/** As in Spending by Category: the chart takes the largest, the table takes all. */
const CHARTED = 15;

/** "+$12.00" or "-$12.00", since which way it moved is the point. */
const signed = (n: number) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`;

/** The change as a share of what it was, or "new" when there was nothing before. */
function percentChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "" : "new";
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/**
 * A month or a year of spending against the one before it, by category. A
 * period still running is compared to date, against the same stretch of the
 * one before, so a third of a month is not set against a whole one.
 */
export function SpendingComparisonReport({ budgetId }: { budgetId: number }) {
  const filters = useReportFilters("last12");
  const search = reportRoute.useSearch();
  const navigate = reportRoute.useNavigate();
  const period: ComparisonPeriod = search.period ?? "month";
  const now = currentAnchor(period);
  const anchor = search.anchor && search.anchor.length === now.length ? search.anchor : now;
  const setPeriod = (next: ComparisonPeriod) =>
    navigate({ search: (prev) => ({ ...prev, period: next, anchor: undefined }) });
  const setAnchor = (next: string) =>
    navigate({ search: (prev) => ({ ...prev, anchor: next === currentAnchor(period) ? undefined : next }) });

  const { data, isLoading } = trpc.report.spendingComparison.useQuery(
    { budgetId, period, anchor, accountIds: filters.accountIds, categoryIds: filters.categoryIds },
    { enabled: !filters.nothingSelected }
  );

  const rows = data?.rows ?? [];
  const currentLabel = data ? rangeLabel(data.current, period, data.toDate) : "";
  const previousLabel = data ? rangeLabel(data.previous, period, data.toDate) : "";
  const chartConfig = {
    previous: { label: previousLabel || "Before", color: CHART_COLORS.purple },
    current: { label: currentLabel || "Now", color: CHART_COLORS.blue },
  } satisfies ChartConfig;
  const charted = [...rows]
    .sort((a, b) => Math.max(b.current, b.previous) - Math.max(a.current, a.previous))
    .slice(0, CHARTED);

  return (
    <ReportLayout
      title={period === "month" ? "Month over Month" : "Year over Year"}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[period]}
            onValueChange={(value) => value[0] && setPeriod(value[0] as ComparisonPeriod)}
            aria-label="Compare by"
          >
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
            <ToggleGroupItem value="year">Year</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Previous ${period}`}
              onClick={() => setAnchor(stepAnchor(period, anchor, -1))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">{currentLabel}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Next ${period}`}
              disabled={anchor >= now}
              onClick={() => setAnchor(stepAnchor(period, anchor, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <ReportFilters
            budgetId={budgetId}
            filters={filters}
            accounts="budget"
            categories
            timeframe={false}
          />
        </div>
      }
      stats={
        <>
          <SummaryStat label={currentLabel || "Now"} color={CHART_COLORS.blue} value={formatCurrency(data?.totals.current ?? 0)} />
          <SummaryStat label={previousLabel || "Before"} color={CHART_COLORS.purple} value={formatCurrency(data?.totals.previous ?? 0)} />
          <SummaryStat
            label="Change"
            value={`${signed(data?.totals.change ?? 0)} ${percentChange(data?.totals.current ?? 0, data?.totals.previous ?? 0)}`.trim()}
          />
        </>
      }
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      emptyMessage={filters.nothingSelected ? NOTHING_SELECTED : "Nothing was spent in either period."}
      messageClassName="h-60"
      footer={
        rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">{previousLabel}</TableHead>
                <TableHead className="text-right">{currentLabel}</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.categoryId}>
                  <TableCell>{row.category}</TableCell>
                  <TableCell className="text-muted-foreground">{row.group}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(row.previous)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.current)}</TableCell>
                  <TableCell className="text-right tabular-nums">{signed(row.change)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {percentChange(row.current, row.previous)}
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
        style={{ height: Math.max(280, charted.length * 44) }}
      >
        <BarChart data={charted} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickFormatter={formatCompactCurrency} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="category" width={140} tickLine={false} axisLine={false} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">
                      {chartConfig[name as keyof typeof chartConfig]?.label}
                    </span>
                    <span className="font-mono tabular-nums">{formatCurrency(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="previous" fill="var(--color-previous)" radius={[0, 4, 4, 0]} />
          <Bar dataKey="current" fill="var(--color-current)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartContainer>
    </ReportLayout>
  );
}

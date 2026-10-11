import { useMemo } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { cell, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react/tooltip";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleBand, scaleThreshold } from "d3-scale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/trpc";
import { formatCurrency } from "@/lib/utils";
import { CHART_COLORS } from "@/lib/chart";
import { type CalendarDay, calendarDays, colorCeiling, monthStarts } from "@/lib/spending-calendar";
import { NOTHING_SELECTED, useReportFilters } from "@/hooks/useReportFilters";
import { Button } from "@/components/ui/button";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportLayout } from "@/components/reports/report-layout";
import { SummaryStat } from "@/components/reports/summary-stat";

const reportRoute = getRouteApi("/budgets/$budgetId/reports/$reportId");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKS = Array.from({ length: 54 }, (_, i) => i);
const EARLIEST_YEAR = 1900;

/**
 * Five steps from nothing spent to the busiest days. Stepped rather than
 * blended so each step can be a mix of the theme's own colour, which a
 * continuous scale cannot interpolate through.
 */
const SHADES = [
  "var(--muted)",
  `color-mix(in oklab, ${CHART_COLORS.blue} 30%, var(--muted))`,
  `color-mix(in oklab, ${CHART_COLORS.blue} 55%, var(--muted))`,
  `color-mix(in oklab, ${CHART_COLORS.blue} 80%, var(--muted))`,
  CHART_COLORS.blue,
];

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The spend each shade begins at, for the legend: nothing, then up from each threshold. */
function shadeLabels(ceiling: number): string[] {
  const at = (share: number) => formatCurrency(ceiling * share);
  return ["Nothing spent", `Up to ${at(0.25)}`, `${at(0.25)} to ${at(0.5)}`, `${at(0.5)} to ${at(0.75)}`, `Over ${at(0.75)}`];
}

/** The calendar itself: a cell per day, weeks across and weekdays down. */
function CalendarChart({ days, ceiling, ariaLabel }: { days: CalendarDay[]; ceiling: number; ariaLabel: string }) {
  // The chart re-renders whenever its definition changes identity, so it is
  // built once per set of days rather than on every render of the page.
  const definition = useMemo(() => {
    const starts = monthStarts(days);
    return defineChart(
      {
        marks: [
          cell(days, {
            key: "date",
            x: "week",
            y: (day) => WEEKDAYS[day.weekday],
            color: "spent",
            inset: 1.5,
            radius: 2,
          }),
        ],
        scales: {
          x: {
            scale: scaleBand<number>().domain(WEEKS).paddingInner(0).paddingOuter(0),
            side: "top",
            axis: {
              line: false,
              ticks: {
                values: starts.map((s) => s.week),
                format: (week) => starts.find((s) => s.week === week)?.month ?? "",
                size: 0,
              },
              tickLabels: { thin: false },
            },
          },
          y: {
            scale: scaleBand<string>().domain(WEEKDAYS).paddingInner(0).paddingOuter(0),
            axis: { line: false, ticks: { values: ["Mon", "Wed", "Fri"], size: 0 } },
          },
        },
        color: {
          // Anything above a cent is spending; refunds and nothing share the
          // empty shade, since a calendar of spending has no below-zero colour.
          scale: scaleThreshold<number, string>()
            .domain([0.005, ceiling * 0.25, ceiling * 0.5, ceiling * 0.75])
            .range(SHADES),
        },
      },
      { tooltip: { use: tooltip, format: (point) => `${longDate(point.datum.date)}: ${formatCurrency(point.datum.spent)}` } }
    );
  }, [days, ceiling]);

  return <Chart ariaLabel={ariaLabel} definition={definition} height={170} className="text-muted-foreground" />;
}

/**
 * A year of spending laid out as a calendar, a cell per day, so heavy days
 * and runs of them stand out. Days are each day's net, as in Spending by
 * Category, under the shared account and category filters.
 */
export function SpendingCalendarReport({ budgetId }: { budgetId: number }) {
  const filters = useReportFilters("thisYear");
  const search = reportRoute.useSearch();
  const navigate = reportRoute.useNavigate();
  const today = localToday();
  const thisYear = Number(today.slice(0, 4));
  const year = search.year && search.year < thisYear ? search.year : thisYear;
  const setYear = (next: number) =>
    navigate({ search: (prev) => ({ ...prev, year: next === thisYear ? undefined : next }) });

  const { data, isLoading } = trpc.report.dailySpending.useQuery(
    { budgetId, year, accountIds: filters.accountIds, categoryIds: filters.categoryIds },
    { enabled: !filters.nothingSelected }
  );

  // Laid out through the day the server counted to, so the cells are exactly
  // the days the totals cover, whatever the browser's own date is.
  const days = useMemo(() => (data ? calendarDays(data.year, data.days, data.through) : []), [data]);
  const ceiling = useMemo(() => colorCeiling(days.map((d) => d.spent)), [days]);
  const daysInYear = data?.daysInYear ?? 0;

  return (
    <ReportLayout
      title="Spending Calendar"
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous year"
              disabled={year <= EARLIEST_YEAR}
              onClick={() => setYear(year - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-12 text-center text-sm font-medium">{year}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next year"
              disabled={year >= thisYear}
              onClick={() => setYear(year + 1)}
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
          <SummaryStat label="Total spent" value={formatCurrency(data?.total ?? 0)} />
          <SummaryStat
            label="Per day"
            value={formatCurrency(daysInYear > 0 ? (data?.total ?? 0) / daysInYear : 0)}
          />
          <SummaryStat label="No-spend days" value={`${daysInYear - (data?.spendingDays ?? 0)} of ${daysInYear}`} />
          <SummaryStat
            label="Biggest day"
            value={data?.biggest ? `${formatCurrency(data.biggest.spent)} on ${longDate(data.biggest.date)}` : "None"}
          />
        </>
      }
      isLoading={isLoading}
      isEmpty={days.length === 0 || (data?.days.length ?? 0) === 0}
      emptyMessage={filters.nothingSelected ? NOTHING_SELECTED : "Nothing was spent in this year."}
      messageClassName="h-44"
    >
      <CalendarChart days={days} ceiling={ceiling} ariaLabel={`Spending each day of ${year}`} />
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        Less
        {shadeLabels(ceiling).map((label, i) => (
          <span
            key={label}
            title={label}
            aria-label={label}
            role="img"
            className="inline-block size-3 rounded-sm"
            style={{ background: SHADES[i] }}
          />
        ))}
        More
      </div>
    </ReportLayout>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { budgetSearchSchema } from "@znab/shared";
import { type MonthSummary } from "@/trpc";
import { useBudgetMonths } from "@/hooks/useBudgetMonths";
import { useBudgetPage } from "@/hooks/useBudgetPage";
import { monthParamToDate, dateToMonthParam, currentMonthParam, formatCurrency } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { format, addMonths, subMonths, parseISO } from "date-fns";

export const Route = createFileRoute("/budgets/$budgetId/")({
  validateSearch: budgetSearchSchema,
  component: BudgetPage,
});

function BudgetPage() {
  const { budgetId } = Route.useParams();
  const { month } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { availableMonths } = useBudgetMonths({ budgetId: Number(budgetId) });

  // No month param → show month picker
  if (!month) {
    return (
      <MonthPicker
        budgetId={budgetId}
        months={availableMonths}
        onSelect={(m) => navigate({ search: { month: m } })}
      />
    );
  }

  return <BudgetGrid budgetId={Number(budgetId)} month={month} />;
}

// ─── Budget grid ──────────────────────────────────────────────────────────────

function BudgetGrid({ budgetId, month }: { budgetId: number; month: string }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const dbMonth = monthParamToDate(month); // "YYYY-MM-01"

  const { visibleGroups, summary, isLoading, setBudgeted } = useBudgetPage({ budgetId, month: dbMonth });

  // Month navigation
  const currentDate = parseISO(dbMonth);
  const prevMonth = dateToMonthParam(format(subMonths(currentDate, 1), "yyyy-MM-01"));
  const nextMonth = dateToMonthParam(format(addMonths(currentDate, 1), "yyyy-MM-01"));
  const displayMonth = format(currentDate, "MMMM yyyy");
  const monthShort = format(currentDate, "MMM");
  const prevShort = format(subMonths(currentDate, 1), "MMM");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading budget…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Month nav + summary header */}
      <div className="px-6 py-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate({ search: { month: prevMonth } })}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-semibold">{displayMonth}</h2>
          <button
            onClick={() => navigate({ search: { month: nextMonth } })}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        {summary && (
          <BudgetSummary summary={summary} monthShort={monthShort} prevShort={prevShort} />
        )}
      </div>

      {/* Budget table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr className="text-muted-foreground">
              <th className="text-left px-6 py-2 font-medium">Category</th>
              <th className="text-right px-4 py-2 font-medium w-32">Budgeted</th>
              <th className="text-right px-4 py-2 font-medium w-32">Spent</th>
              <th className="text-right px-6 py-2 font-medium w-32">Available</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => (
              <Fragment key={group.id}>
                {/* Group header row */}
                <tr className="bg-muted/30">
                  <td
                    colSpan={4}
                    className="px-6 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    {group.name}
                  </td>
                </tr>

                {/* Category rows */}
                {group.categories
                  .filter((c) => !c.deletedAt)
                  .map((cat) => (
                    <tr
                      key={cat.id}
                      className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-6 py-2 pl-10">{cat.name}</td>
                      <td className="text-right px-4 py-2">
                        <BudgetedCell
                          value={cat.budgeted}
                          onSave={(val) =>
                            setBudgeted({
                              budgetId: group.budgetId,
                              categoryId: cat.id,
                              month: dbMonth,
                              budgeted: val,
                            })
                          }
                        />
                      </td>
                      <td className="text-right px-4 py-2 text-muted-foreground">
                        {cat.activity !== 0 ? formatCurrency(cat.activity) : "—"}
                      </td>
                      <td
                        className={`text-right px-6 py-2 font-medium ${
                          cat.available < 0
                            ? "text-destructive"
                            : cat.available > 0
                            ? "text-green-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatCurrency(cat.available)}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Available-to-Budget summary ──────────────────────────────────────────────

function BudgetSummary({
  summary,
  monthShort,
  prevShort,
}: {
  summary: MonthSummary;
  monthShort: string;
  prevShort: string;
}) {
  const { notBudgeted, overspentPrev, income, budgeted, availableToBudget: avail } = summary;
  const availColor =
    avail > 0 ? "text-green-500" : avail < 0 ? "text-destructive" : "text-muted-foreground";

  // Each figure is shown as its signed contribution so the row literally sums
  // to Available to Budget, mirroring YNAB's header.
  const minus = (n: number) => (n === 0 ? formatCurrency(0) : formatCurrency(-n));

  return (
    <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
      <Stat label={`Not Budgeted in ${prevShort}`} text={formatCurrency(notBudgeted)} danger={notBudgeted < 0} />
      <Stat label={`Overspent in ${prevShort}`} text={minus(overspentPrev)} warn={overspentPrev > 0} />
      <Stat label={`Income for ${monthShort}`} text={income < 0 ? formatCurrency(income) : `+${formatCurrency(income)}`} />
      <Stat label={`Budgeted in ${monthShort}`} text={minus(budgeted)} />
      <div className="ml-auto flex flex-col items-end justify-center border-l border-border pl-6">
        <span className={`text-xl font-bold tabular-nums ${availColor}`}>{formatCurrency(avail)}</span>
        <span className="text-xs text-muted-foreground">Available to Budget</span>
      </div>
    </div>
  );
}

/** One signed figure + caption in the Available-to-Budget breakdown. */
function Stat({
  label,
  text,
  danger,
  warn,
}: {
  label: string;
  text: string;
  danger?: boolean;
  warn?: boolean;
}) {
  const color = warn ? "text-amber-500" : danger ? "text-destructive" : "text-foreground";
  return (
    <div className="flex flex-col items-end justify-center">
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{text}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Inline budget cell ───────────────────────────────────────────────────────

function BudgetedCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (val: number) => void;
}) {
  return (
    <input
      type="number"
      step="0.01"
      defaultValue={value.toFixed(2)}
      onBlur={(e) => {
        const parsed = parseFloat(e.target.value);
        if (!isNaN(parsed) && parsed !== value) onSave(parsed);
      }}
      className="w-24 text-right bg-transparent focus:bg-accent rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

// ─── Month picker (shown when no ?month param) ────────────────────────────────

function MonthPicker({
  budgetId,
  months,
  onSelect,
}: {
  budgetId: string;
  months: string[];
  onSelect: (month: string) => void;
}) {
  const navigate = useNavigate({ from: Route.fullPath });

  // Group months by year
  const byYear = months.reduce<Record<string, string[]>>((acc, m) => {
    const year = m.slice(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year]!.push(m);
    return acc;
  }, {});

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Select a Month</h2>
        <p className="text-muted-foreground mt-1">
          Or{" "}
          <button
            onClick={() => onSelect(currentMonthParam())}
            className="text-primary underline-offset-2 hover:underline"
          >
            go to current month
          </button>
        </p>
      </div>

      <div className="space-y-6">
        {Object.entries(byYear)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([year, ms]) => (
            <div key={year}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {year}
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {ms.map((m) => (
                  <button
                    key={m}
                    onClick={() => onSelect(dateToMonthParam(m))}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary hover:bg-accent transition-colors text-center"
                  >
                    {format(parseISO(m), "MMM")}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

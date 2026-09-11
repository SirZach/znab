import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { budgetSearchSchema } from "@znab/shared";
import { type MonthSummary } from "@/trpc";
import { useBudgetMonths } from "@/hooks/useBudgetMonths";
import { useBudgetPage } from "@/hooks/useBudgetPage";
import {
  monthParamToDate,
  dateToMonthParam,
  currentMonthParam,
  formatCurrency,
  parseAmountExpression,
  cn,
} from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { CategoryInspector } from "@/components/budget/category-inspector";
import { Fragment, useCallback, useEffect, useState } from "react";
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

// ─── Collapsed master categories ──────────────────────────────────────────────

/**
 * Which category groups are rolled up, remembered per budget so the shape of
 * the grid survives a reload. Browser storage can be unavailable or full, and
 * this is only a convenience, so every access is guarded.
 */
function useCollapsedGroups(budgetId: number) {
  const storageKey = `znab:collapsed-groups:${budgetId}`;

  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });

  const toggleGroup = useCallback(
    (groupId: number) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(groupId)) next.add(groupId);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // Not worth surfacing. The grid still works, it just won't remember.
        }
        return next;
      });
    },
    [storageKey]
  );

  return { collapsed, toggleGroup };
}

// ─── Budget grid ──────────────────────────────────────────────────────────────

function BudgetGrid({ budgetId, month }: { budgetId: number; month: string }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const dbMonth = monthParamToDate(month); // "YYYY-MM-01"

  const {
    visibleGroups,
    summary,
    isLoading,
    setBudgeted,
    moveMoney,
    setConfined,
    isMoving,
    moveError,
  } = useBudgetPage({ budgetId, month: dbMonth });
  const { collapsed, toggleGroup } = useCollapsedGroups(budgetId);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // The selected category, resolved fresh each render so the panel follows the
  // month and any edits made from inside it.
  const selected = visibleGroups
    .flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name })))
    .find((c) => c.id === selectedId);

  const moveSources = visibleGroups.flatMap((g) =>
    g.categories
      .filter((c) => c.id !== selectedId && !c.deletedAt)
      .map((c) => ({ id: c.id, name: c.name, groupName: g.name, available: c.available }))
  );

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

      {/* Budget table, with the selected category's panel alongside */}
      <div className="flex-1 flex min-h-0">
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
            {visibleGroups.map((group) => {
              const cats = group.categories.filter((c) => !c.deletedAt);
              const totals = cats.reduce(
                (acc, c) => ({
                  budgeted: acc.budgeted + c.budgeted,
                  activity: acc.activity + c.activity,
                  available: acc.available + c.available,
                }),
                { budgeted: 0, activity: 0, available: 0 }
              );
              const isCollapsed = collapsed.has(group.id);

              return (
                <Fragment key={group.id}>
                  {/* Group header, with the group's own totals */}
                  <tr
                    className="bg-muted/30 border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleGroup(group.id)}
                  >
                    <td className="px-6 py-2">
                      <button
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`}
                        className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronDown
                          size={13}
                          className={cn("transition-transform", isCollapsed && "-rotate-90")}
                        />
                        {group.name}
                      </button>
                    </td>
                    <td className="text-right px-4 py-2 text-xs font-semibold tabular-nums text-muted-foreground">
                      {formatCurrency(totals.budgeted)}
                    </td>
                    <td className="text-right px-4 py-2 text-xs font-semibold tabular-nums text-muted-foreground">
                      {totals.activity !== 0 ? formatCurrency(totals.activity) : "—"}
                    </td>
                    <td className="text-right px-6 py-2 text-xs font-semibold tabular-nums text-muted-foreground">
                      {formatCurrency(totals.available)}
                    </td>
                  </tr>

                  {/* Category rows */}
                  {!isCollapsed &&
                    cats.map((cat) => (
                      <tr
                        key={cat.id}
                        onClick={() => setSelectedId(cat.id)}
                        aria-selected={cat.id === selectedId}
                        className={cn(
                          "border-b border-border/50 cursor-pointer transition-colors",
                          cat.id === selectedId
                            ? "bg-accent/60"
                            : "hover:bg-accent/30"
                        )}
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
                        <td className="text-right px-4 py-2 text-muted-foreground tabular-nums">
                          {cat.activity !== 0 ? formatCurrency(cat.activity) : "—"}
                        </td>
                        <td className="text-right px-6 py-2">
                          <AvailablePill
                            amount={cat.available}
                            overspendKind={cat.overspendKind}
                          />
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

        {selected && (
          <CategoryInspector
            budgetId={budgetId}
            month={dbMonth}
            category={{
              id: selected.id,
              name: selected.name,
              groupName: selected.groupName,
              budgeted: selected.budgeted,
              activity: selected.activity,
              available: selected.available,
              overspendKind: selected.overspendKind,
              confined: selected.confined,
            }}
            sources={moveSources}
            onSetBudgeted={(amount) =>
              setBudgeted({
                budgetId,
                categoryId: selected.id,
                month: dbMonth,
                budgeted: amount,
              })
            }
            onMoveMoney={(fromCategoryId, amount) =>
              moveMoney({ fromCategoryId, toCategoryId: selected.id, amount })
            }
            onSetConfined={(confined) => setConfined(selected.id, confined)}
            isMoving={isMoving}
            moveError={moveError}
            onClose={() => setSelectedId(null)}
          />
        )}
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
  const {
    notBudgeted,
    overspentPrev,
    income,
    budgeted,
    budgetedFuture,
    availableToBudget: avail,
  } = summary;
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
      {/* Only shown once money is committed ahead, as in YNAB 4. */}
      {budgetedFuture !== 0 && (
        <Stat label="Budgeted in Future" text={minus(budgetedFuture)} warn={budgetedFuture > 0} />
      )}
      <div className="ml-auto flex flex-col items-end justify-center border-l border-border pl-6">
        <span className={`text-xl font-bold tabular-nums ${availColor}`}>{formatCurrency(avail)}</span>
        <span className="text-xs text-muted-foreground">Available to Budget</span>
      </div>
    </div>
  );
}

// ─── Available balance ────────────────────────────────────────────────────────

/**
 * A category's month-end balance. YNAB 4 separates the two ways a category goes
 * negative: red when cash overspending will come out of next month's
 * To-be-Budgeted, amber when it is credit-card debt that will not.
 */
function AvailablePill({
  amount,
  overspendKind,
}: {
  amount: number;
  overspendKind: "cash" | "credit" | null;
}) {
  const tone =
    amount < 0
      ? overspendKind === "credit"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-destructive/15 text-destructive"
      : amount > 0
      ? "text-green-600 dark:text-green-500"
      : "text-muted-foreground";

  const title =
    amount < 0
      ? overspendKind === "credit"
        ? "Overspent on credit. Carried as debt, so it does not reduce next month's To be Budgeted"
        : "Overspent in cash. This comes out of next month's To be Budgeted"
      : undefined;

  return (
    <span
      title={title}
      className={cn(
        "inline-block rounded px-2 py-0.5 font-medium tabular-nums",
        tone
      )}
    >
      {formatCurrency(amount)}
    </span>
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

/**
 * A budgeted amount, editable in place. Accepts arithmetic the way YNAB 4 does
 * such as `25+13` or `120/3`, so it is a text field rather than a number one, which
 * would reject the operators as you typed them.
 */
function BudgetedCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (val: number) => void;
}) {
  const [draft, setDraft] = useState(() => value.toFixed(2));
  const [editing, setEditing] = useState(false);

  // The same cell is reused as you move between months, so it has to follow the
  // value it is given. While someone is mid-edit, their draft wins.
  useEffect(() => {
    if (!editing) setDraft(value.toFixed(2));
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const parsed = parseAmountExpression(draft);
    if (parsed === null) {
      setDraft(value.toFixed(2)); // unreadable, so leave the amount as it was
      return;
    }
    if (parsed !== value) onSave(parsed);
    setDraft(parsed.toFixed(2));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label="Budgeted amount"
      value={draft}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value.toFixed(2));
          setEditing(false);
          e.currentTarget.blur();
        }
      }}
      className="w-24 text-right bg-transparent focus:bg-accent rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring tabular-nums"
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

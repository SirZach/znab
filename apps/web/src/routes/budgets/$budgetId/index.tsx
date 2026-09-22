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
  adjustAmount,
  cn,
} from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Minus } from "lucide-react";
import { CategoryInspector } from "@/components/budget/category-inspector";
import { BulkBudgetPanel } from "@/components/budget/bulk-budget-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
    hidden,
    summary,
    isLoading,
    setBudgeted,
    moveMoney,
    setConfined,
    setCategoryGoal,
    setCategoryHidden,
    isMoving,
    moveError,
  } = useBudgetPage({ budgetId, month: dbMonth });
  const [showHidden, setShowHidden] = useState(false);
  const { collapsed, toggleGroup } = useCollapsedGroups(budgetId);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [anchorId, setAnchorId] = useState<number | null>(null);

  // Every category row currently on screen, in the order it appears. Arrow keys
  // and shift-click ranges both read this, so they agree on what "next" means
  // and neither steps into a collapsed group.
  const visibleRowIds = visibleGroups.flatMap((g) =>
    collapsed.has(g.id)
      ? []
      : g.categories.filter((c) => !c.deletedAt).map((c) => c.id)
  );

  // One selected category opens the inspector; several open the bulk panel.
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0]! : null;

  // Resolved fresh each render so the panel follows the month and any edits
  // made from inside it.
  const selected = visibleGroups
    .flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name })))
    .find((c) => c.id === selectedId);

  const moveSources = visibleGroups.flatMap((g) =>
    g.categories
      .filter((c) => c.id !== selectedId && !c.deletedAt)
      .map((c) => ({ id: c.id, name: c.name, groupName: g.name, available: c.available }))
  );

  function selectRow(event: React.MouseEvent, id: number) {
    if (event.shiftKey && anchorId !== null) {
      const from = visibleRowIds.indexOf(anchorId);
      const to = visibleRowIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setSelectedIds(new Set(visibleRowIds.slice(lo, hi + 1)));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      });
      setAnchorId(id);
      return;
    }
    setSelectedIds(new Set([id]));
    setAnchorId(id);
  }

  // Budget cells register themselves so arrow keys can hand focus along without
  // the grid having to own every input's state.
  const cellRefs = useRef(new Map<number, HTMLInputElement>());
  const registerCell = useCallback((id: number, el: HTMLInputElement | null) => {
    if (el) cellRefs.current.set(id, el);
    else cellRefs.current.delete(id);
  }, []);

  function moveFocus(fromId: number, delta: number) {
    const index = visibleRowIds.indexOf(fromId);
    if (index === -1) return;
    const target = visibleRowIds[index + delta];
    if (target === undefined) return; // first or last cell: stay put
    const el = cellRefs.current.get(target);
    if (el) {
      el.focus();
      el.select();
    }
  }

  function budgetCategory(categoryId: number, amount: number) {
    setBudgeted({ budgetId, categoryId, month: dbMonth, budgeted: amount });
  }

  function budgetSelected(amount: number) {
    for (const id of selectedIds) budgetCategory(id, amount);
  }

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
                      {formatCurrency(totals.activity)}
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
                        onClick={(e) => selectRow(e, cat.id)}
                        aria-selected={selectedIds.has(cat.id)}
                        className={cn(
                          "border-b border-border/50 cursor-pointer transition-colors",
                          selectedIds.has(cat.id)
                            ? "bg-accent/60"
                            : "hover:bg-accent/30"
                        )}
                      >
                        <td className="px-6 py-2 pl-10">
                          <span className="flex items-center gap-2">
                            {cat.name}
                            {cat.goal && <GoalDot goal={cat.goal} />}
                          </span>
                        </td>
                        <td className="text-right px-4 py-2">
                          <BudgetedCell
                            categoryId={cat.id}
                            value={cat.budgeted}
                            registerRef={registerCell}
                            onMove={(delta) => moveFocus(cat.id, delta)}
                            onSave={(val) => budgetCategory(cat.id, val)}
                          />
                        </td>
                        <td className="text-right px-4 py-2 text-muted-foreground tabular-nums">
                          {formatCurrency(cat.activity)}
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

            {/* Hidden categories, kept out of the group subtotals above but
                still reachable, since their history belongs to past months. */}
            {hidden.length > 0 && (
              <Fragment key="hidden">
                <tr
                  className="bg-muted/30 border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setShowHidden((v) => !v)}
                >
                  <td colSpan={4} className="px-6 py-2">
                    <button
                      aria-expanded={showHidden}
                      className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown
                        size={13}
                        className={cn("transition-transform", !showHidden && "-rotate-90")}
                      />
                      Hidden Categories ({hidden.length})
                    </button>
                  </td>
                </tr>

                {showHidden &&
                  hidden.map((cat) => (
                    <tr key={cat.id} className="border-b border-border/50 text-muted-foreground">
                      <td className="px-6 py-2 pl-10">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate">{cat.name}</span>
                          <span className="text-xs opacity-70">{cat.groupName}</span>
                        </span>
                      </td>
                      <td className="text-right px-4 py-2 tabular-nums">
                        {formatCurrency(cat.budgeted)}
                      </td>
                      <td className="text-right px-4 py-2 tabular-nums">
                        {formatCurrency(cat.activity)}
                      </td>
                      <td className="text-right px-6 py-2">
                        <span className="flex items-center justify-end gap-2">
                          <span className="tabular-nums">{formatCurrency(cat.available)}</span>
                          <button
                            onClick={() => setCategoryHidden(cat.id, false)}
                            className="text-xs px-1.5 py-0.5 rounded border border-border hover:text-foreground hover:bg-accent transition-colors"
                          >
                            Unhide
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
              </Fragment>
            )}
          </tbody>
        </table>
      </div>

        {selected && (
          <CategoryInspector
            // Keyed so the panel's own drafts, the move direction and the goal
            // editor, reset when a different category is selected rather than
            // carrying the previous one's values over.
            key={selected.id}
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
              goal: selected.goal,
            }}
            sources={moveSources}
            onSetBudgeted={(amount) => budgetCategory(selected.id, amount)}
            onMoveMoney={(otherCategoryId, amount, direction) =>
              moveMoney(
                direction === "in"
                  ? { fromCategoryId: otherCategoryId, toCategoryId: selected.id, amount }
                  : { fromCategoryId: selected.id, toCategoryId: otherCategoryId, amount }
              )
            }
            onSetConfined={(confined) => setConfined(selected.id, confined)}
            onSetGoal={(goal) => setCategoryGoal(selected.id, goal)}
            onHide={() => {
              setCategoryHidden(selected.id, true);
              setSelectedIds(new Set());
            }}
            isMoving={isMoving}
            moveError={moveError}
            onClose={() => setSelectedIds(new Set())}
          />
        )}

        {selectedIds.size > 1 && (
          <BulkBudgetPanel
            categories={visibleGroups.flatMap((g) =>
              g.categories
                .filter((c) => selectedIds.has(c.id))
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  groupName: g.name,
                  budgeted: c.budgeted,
                }))
            )}
            onBudgetAll={budgetSelected}
            onClear={() => setSelectedIds(new Set())}
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

// ─── Goal indicator ───────────────────────────────────────────────────────────

/**
 * A small ring on any category carrying a goal, filled to its progress, so the
 * grid shows which envelopes are behind without opening each one.
 */
function GoalDot({
  goal,
}: {
  goal: { percent: number; underFunded: number; neededThisMonth: number };
}) {
  const pct = Math.round(goal.percent * 100);
  const behind = goal.underFunded > 0;

  return (
    <span
      title={
        behind
          ? `Goal ${pct}% funded, ${formatCurrency(goal.underFunded)} short this month`
          : `Goal ${pct}% funded, on track`
      }
      aria-label={`Goal ${pct} percent funded`}
      className={cn(
        "inline-block size-2 rounded-full shrink-0",
        behind ? "bg-amber-500" : "bg-green-600 dark:bg-green-500"
      )}
    />
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
  categoryId,
  value,
  onSave,
  onMove,
  registerRef,
}: {
  categoryId: number;
  value: number;
  onSave: (val: number) => void;
  onMove: (delta: number) => void;
  registerRef: (id: number, el: HTMLInputElement | null) => void;
}) {
  const [draft, setDraft] = useState(() => value.toFixed(2));
  const [editing, setEditing] = useState(false);

  // Which +/- popup, if any, is open. Kept here rather than in each popup so
  // the hover affordances know to stay visible while one of them is open.
  const [adjusting, setAdjusting] = useState<"+" | "-" | null>(null);

  // Whether this cell has been typed into since it was last committed. Arrow
  // keys commit and then move focus, which fires blur and would otherwise
  // commit the same amount a second time.
  const dirty = useRef(false);

  // The same cell is reused as you move between months, so it has to follow the
  // value it is given. While someone is mid-edit, their draft wins.
  useEffect(() => {
    if (!editing) setDraft(value.toFixed(2));
  }, [value, editing]);

  function commit() {
    setEditing(false);
    if (!dirty.current) return; // nothing typed, so nothing to save
    dirty.current = false;

    const parsed = parseAmountExpression(draft);
    if (parsed === null) {
      setDraft(value.toFixed(2)); // unreadable, so leave the amount as it was
      return;
    }
    if (parsed !== value) onSave(parsed);
    setDraft(parsed.toFixed(2));
  }

  // Adjust what the cell is showing, not the amount last fetched. Reaching for
  // one of these buttons blurs the input, which commits anything typed there,
  // and the fetched value will not have caught that up yet: adding 50 to a
  // freshly typed 200 has to give 250, not 50 more than whatever it held
  // before. The draft is normalised on every commit, so it is always readable.
  function applyAdjustment(op: "+" | "-", typed: string) {
    setAdjusting(null);
    const next = adjustAmount(parseAmountExpression(draft) ?? value, op, typed);
    if (next === null) return; // unreadable, so leave the amount as it was
    onSave(next);
  }

  return (
    <div className="relative inline-block group">
      {/* Out of the flow entirely, over the empty left of a right-aligned
          amount, so appearing cannot shift the figure by a pixel and cannot
          reach into the category beside it. Hidden rather than transparent,
          since a transparent button still swallows the clicks meant for the
          amount underneath it. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute inset-y-0 left-0 z-10 flex items-center gap-0.5 invisible",
          "group-hover:visible group-focus-within:visible",
          adjusting && "visible"
        )}
      >
        <AdjustButton
          op="+"
          open={adjusting === "+"}
          onOpenChange={(open) => setAdjusting(open ? "+" : null)}
          onApply={(typed) => applyAdjustment("+", typed)}
        />
        <AdjustButton
          op="-"
          open={adjusting === "-"}
          onOpenChange={(open) => setAdjusting(open ? "-" : null)}
          onApply={(typed) => applyAdjustment("-", typed)}
        />
      </div>
      <input
        ref={(el) => registerRef(categoryId, el)}
        type="text"
        inputMode="decimal"
        aria-label="Budgeted amount"
        value={draft}
        onFocus={(e) => {
          setEditing(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          dirty.current = true;
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter and the arrows all commit and hand focus to the neighbouring
          // cell, so a whole month can be budgeted without reaching for a mouse.
          if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            commit();
            onMove(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            commit();
            onMove(-1);
          } else if (e.key === "Escape") {
            dirty.current = false;
            setDraft(value.toFixed(2));
            setEditing(false);
            e.currentTarget.blur();
          }
        }}
        className="w-24 text-right bg-transparent focus:bg-accent rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring tabular-nums"
      />
    </div>
  );
}

/**
 * One of the two +/- buttons on a Budgeted cell, and the small popup it opens.
 * The popup reads a plain magnitude, never a signed one: the button pressed is
 * what decides whether it is added or subtracted, so `onApply` gets the raw
 * text and leaves the sign to the caller.
 */
function AdjustButton({
  op,
  open,
  onOpenChange,
  onApply,
}: {
  op: "+" | "-";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (typed: string) => void;
}) {
  const [typed, setTyped] = useState("");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setTyped("");
      }}
    >
      <PopoverTrigger
        tabIndex={-1}
        aria-label={op === "+" ? "Add to budgeted amount" : "Subtract from budgeted amount"}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        {op === "+" ? <Plus size={12} /> : <Minus size={12} />}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2"
        align="center"
        // Portalled out of the row in the DOM, but a React event still travels
        // the tree it was rendered in, so without this a click in here would
        // reach the row underneath and change what is selected.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // This popup sits over a cell with its own Enter/Escape handling.
          // Its keystrokes are for the amount being typed here, not the cell.
          e.stopPropagation();
          if (e.key === "Enter") {
            onApply(typed);
          } else if (e.key === "Escape") {
            onOpenChange(false);
          }
        }}
      >
        <div className="flex items-center gap-1">
          {/* Which of the two buttons was pressed, said again where the amount
              is being typed, since the button itself is now behind a popup. */}
          <span aria-hidden className="text-muted-foreground">
            {op}
          </span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={op === "+" ? "Amount to add" : "Amount to subtract"}
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-20 text-right bg-transparent focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 tabular-nums"
          />
        </div>
      </PopoverContent>
    </Popover>
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

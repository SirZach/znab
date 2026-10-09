import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { trpc } from "@/trpc";
import { cn, formatCurrency, formatDateShort, parseAmountExpression } from "@/lib/utils";

export type GoalType = "TB" | "TBD" | "MF";

export type CategoryGoal = {
  type: GoalType;
  target: number;
  targetMonth: string | null;
  neededThisMonth: number;
  underFunded: number;
  percent: number;
};

export type InspectedCategory = {
  id: number;
  name: string;
  groupName: string;
  budgeted: number;
  activity: number;
  available: number;
  overspendKind: "cash" | "confined" | null;
  confined: boolean;
  goal: CategoryGoal | null;
};

export type MoveSource = { id: number; name: string; groupName: string; available: number };

/** Which way money is moving relative to the selected category. */
type MoveDirection = "in" | "out";

const GOAL_LABELS: Record<GoalType, string> = {
  TB: "Target balance",
  TBD: "Target balance by date",
  MF: "Monthly funding",
};

/**
 * YNAB 4's right-hand panel for the selected category: where it stands this
 * month, its goal, the Quick Budget shortcuts, moving money either direction,
 * recent history, and whether overspending is confined here. While
 * `showSpent` is on, the transactions behind this month's Spent open under it.
 * `readOnly` keeps only what can be read: the standing, the goal's progress and
 * the history, with none of the controls that change the budget.
 */
export function CategoryInspector({
  budgetId,
  month,
  category,
  sources,
  onSetBudgeted,
  onMoveMoney,
  onSetConfined,
  onSetGoal,
  onHide,
  isMoving,
  moveError,
  showSpent,
  onShowSpent,
  onClose,
  readOnly = false,
}: {
  budgetId: number;
  month: string;
  category: InspectedCategory;
  sources: MoveSource[];
  onSetBudgeted: (amount: number) => void;
  onMoveMoney: (otherCategoryId: number, amount: number, direction: MoveDirection) => void;
  onSetConfined: (confined: boolean) => void;
  onSetGoal: (goal: {
    goalType: GoalType | null;
    target?: number;
    targetMonth?: string;
  }) => void;
  onHide: () => void;
  isMoving: boolean;
  moveError: string | null;
  showSpent: boolean;
  onShowSpent: (show: boolean) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const { data: quick } = trpc.budget.quickBudget.useQuery(
    { budgetId, categoryId: category.id, month },
    // Only feeds the Quick Budget buttons, which a read-only panel leaves out
    { enabled: !readOnly }
  );
  const { data: history } = trpc.budget.categoryHistory.useQuery({
    budgetId,
    categoryId: category.id,
    month,
    months: 12,
  });

  const shortfall = category.available < 0 ? -category.available : 0;
  const surplus = category.available > 0 ? category.available : 0;

  // A category in the red wants money pulled in; one with a surplus is the
  // natural place to push money out of.
  const [direction, setDirection] = useState<MoveDirection>(
    shortfall > 0 ? "in" : "out"
  );
  const [otherId, setOtherId] = useState<number | "">("");
  const [amount, setAmount] = useState("");

  const suggested = direction === "in" ? shortfall : surplus;
  const amountValue = amount === "" ? (suggested ? suggested.toFixed(2) : "") : amount;
  const parsedAmount = parseAmountExpression(amountValue);
  const canMove = otherId !== "" && parsedAmount !== null && parsedAmount > 0 && !isMoving;

  const quickActions: Array<{ label: string; amount: number | undefined }> = [
    { label: "Budgeted last month", amount: quick?.budgetedLastMonth },
    { label: "Spent last month", amount: quick?.spentLastMonth },
    { label: "Average budgeted", amount: quick?.averageBudgeted },
    { label: "Average spent", amount: quick?.averageSpent },
    { label: "Balance to zero", amount: quick?.balanceToZero },
  ];
  if (category.goal) {
    quickActions.push({ label: "Goal for this month", amount: category.goal.neededThisMonth });
  }

  return (
    // A panel beside the grid on a desktop. A phone has no room beside it, so
    // there it covers the whole screen, and the grid underneath keeps its place.
    <aside className="fixed inset-0 z-40 bg-card overflow-y-auto md:static md:z-auto md:w-80 md:shrink-0 md:border-l md:border-border">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <button
          onClick={onClose}
          aria-label="Back to the budget"
          className="-ml-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors md:hidden"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 max-md:flex-1">
          <h3 className="font-semibold truncate">{category.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{category.groupName}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Where the category stands */}
      <div className="py-3 border-b border-border">
        <dl className="px-4 space-y-1.5">
          <Row label="Budgeted" value={formatCurrency(category.budgeted)} />
          <Row
            label={
              <button
                onClick={() => onShowSpent(!showSpent)}
                aria-expanded={showSpent}
                title={showSpent ? "Hide the transactions" : "Show the transactions behind this"}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                Spent
                <ChevronRight
                  size={13}
                  className={cn("transition-transform", showSpent && "rotate-90")}
                />
              </button>
            }
            value={formatCurrency(category.activity)}
          />
        </dl>
        {showSpent && (
          <SpentSection budgetId={budgetId} categoryId={category.id} month={month} />
        )}
        <dl className="px-4 space-y-1.5 mt-1.5">
          <Row
            label="Available"
            value={formatCurrency(category.available)}
            emphasis
            tone={
              category.available < 0
                ? category.overspendKind === "confined"
                  ? "warn"
                  : "danger"
                : category.available > 0
                ? "good"
                : undefined
            }
          />
          {category.available < 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              {category.overspendKind === "confined"
                ? "Overspending is confined to this category. It carries forward and does not reduce next month's To be Budgeted."
                : "Overspent. This comes out of next month's To be Budgeted."}
            </p>
          )}
        </dl>
      </div>

      {/* Read-only, a goal is shown only when there is one to show progress on */}
      {(!readOnly || category.goal) && (
        <GoalSection
          goal={category.goal}
          onSetGoal={onSetGoal}
          month={month}
          readOnly={readOnly}
        />
      )}

      {!readOnly && (
        <>
          {/* Quick Budget */}
          <section className="px-4 py-3 border-b border-border">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Quick Budget
            </h4>
            <div className="space-y-1">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  disabled={action.amount === undefined}
                  onClick={() => action.amount !== undefined && onSetBudgeted(action.amount)}
                  className="flex w-full items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-sm hover:border-primary hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  <span>{action.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {action.amount === undefined ? "..." : formatCurrency(action.amount)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Move money, either direction */}
          <section className="px-4 py-3 border-b border-border">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Move money
            </h4>

            <div className="flex rounded border border-border overflow-hidden mb-2" role="group">
              {(
                [
                  ["in", shortfall > 0 ? "Cover from" : "Move in from"],
                  ["out", "Move out to"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={direction === value}
                  onClick={() => {
                    setDirection(value);
                    setAmount("");
                  }}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-xs transition-colors",
                    direction === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <select
                id={`move-other-${category.id}`}
                aria-label={direction === "in" ? "Category to take from" : "Category to send to"}
                value={otherId}
                onChange={(e) => setOtherId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Choose a category...</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.groupName}: {s.name} ({formatCurrency(s.available)})
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <input
                  id={`move-amount-${category.id}`}
                  type="text"
                  inputMode="decimal"
                  aria-label="Amount to move"
                  placeholder="0.00"
                  value={amountValue}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  disabled={!canMove}
                  onClick={() => {
                    if (otherId === "" || parsedAmount === null) return;
                    onMoveMoney(otherId, parsedAmount, direction);
                    setAmount("");
                    setOtherId("");
                  }}
                  className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isMoving ? "Moving..." : "Move"}
                </button>
              </div>

              {moveError && <p className="text-xs text-destructive">{moveError}</p>}
            </div>
          </section>
        </>
      )}

      <HistorySection history={history} />

      {!readOnly && (
        <>
          {/* Overspending handling */}
          <section className="px-4 py-3 border-b border-border">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                id={`confine-${category.id}`}
                type="checkbox"
                checked={category.confined}
                onChange={(e) => onSetConfined(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Confine overspending to this category
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Keeps a shortfall here instead of taking it out of next month's
                  To be Budgeted.
                </span>
              </span>
            </label>
          </section>

          <section className="px-4 py-3">
            <button
              onClick={onHide}
              className="w-full rounded border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Hide this category
            </button>
            <p className="text-xs text-muted-foreground mt-2">
              It moves to Hidden Categories at the foot of the grid. Past months keep
              whatever was budgeted and spent here.
            </p>
          </section>
        </>
      )}
    </aside>
  );
}

// ─── Goal ─────────────────────────────────────────────────────────────────────

function GoalSection({
  goal,
  month,
  onSetGoal,
  readOnly,
}: {
  goal: CategoryGoal | null;
  month: string;
  onSetGoal: (goal: {
    goalType: GoalType | null;
    target?: number;
    targetMonth?: string;
  }) => void;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<GoalType>(goal?.type ?? "MF");
  const [target, setTarget] = useState(goal ? goal.target.toFixed(2) : "");
  const [targetMonth, setTargetMonth] = useState(goal?.targetMonth ?? month.slice(0, 7));

  const parsedTarget = parseAmountExpression(target);
  const canSave = parsedTarget !== null && parsedTarget > 0;

  function save() {
    if (parsedTarget === null) return;
    onSetGoal({
      goalType: type,
      target: parsedTarget,
      // The API wants a first-of-month date; the picker gives YYYY-MM.
      targetMonth: type === "TBD" ? `${targetMonth}-01` : undefined,
    });
    setEditing(false);
  }

  return (
    <section className="px-4 py-3 border-b border-border">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Goal
        </h4>
        {!editing && !readOnly && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline"
          >
            {goal ? "Edit" : "Add a goal"}
          </button>
        )}
      </div>

      {!editing && !goal && (
        <p className="text-xs text-muted-foreground">
          No goal set. YNAB 4 offers a target balance, a target balance by a date,
          or a monthly funding amount.
        </p>
      )}

      {!editing && goal && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{GOAL_LABELS[goal.type]}</span>
            <span className="tabular-nums">{formatCurrency(goal.target)}</span>
          </div>
          {goal.targetMonth && (
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span>By</span>
              <span className="tabular-nums">{goal.targetMonth}</span>
            </div>
          )}

          <div
            className="h-1.5 rounded bg-muted overflow-hidden"
            role="img"
            aria-label={`${Math.round(goal.percent * 100)} percent of goal`}
          >
            <div
              className={cn("h-full", goal.underFunded > 0 ? "bg-amber-500" : "bg-green-600")}
              style={{ width: `${Math.round(goal.percent * 100)}%` }}
            />
          </div>

          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {Math.round(goal.percent * 100)}% funded
            </span>
            <span
              className={cn(
                "tabular-nums",
                goal.underFunded > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
              )}
            >
              {goal.underFunded > 0
                ? `${formatCurrency(goal.underFunded)} short`
                : "On track"}
            </span>
          </div>

          {!readOnly && (
            <button
              onClick={() => onSetGoal({ goalType: null })}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Remove goal
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          <select
            aria-label="Goal type"
            value={type}
            onChange={(e) => setType(e.target.value as GoalType)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="MF">Monthly funding</option>
            <option value="TB">Target balance</option>
            <option value="TBD">Target balance by date</option>
          </select>

          <input
            type="text"
            inputMode="decimal"
            aria-label="Goal amount"
            placeholder="0.00"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          />

          {type === "TBD" && (
            <input
              type="month"
              aria-label="Target month"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )}

          <div className="flex gap-2">
            <button
              disabled={!canSave}
              onClick={save}
              className="flex-1 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Save goal
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

/**
 * The last twelve months of spending in this category, one bar a month on a
 * shared scale.
 */
function HistorySection({
  history,
}: {
  history: Array<{ month: string; spent: number }> | undefined;
}) {
  if (!history || history.length === 0) return null;

  // never divide by zero on a category that has never moved
  const peak = Math.max(...history.map((h) => h.spent), 1);

  return (
    <section className="px-4 py-3 border-b border-border">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Spent in the last 12 months
      </h4>
      <div className="space-y-1">
        {history.map((h) => (
          <div key={h.month} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
              {h.month}
            </span>
            <div className="flex-1 min-w-0 h-1.5 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-primary/70"
                style={{ width: `${(h.spent / peak) * 100}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {formatCurrency(h.spent)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Spent ────────────────────────────────────────────────────────────────────

/**
 * Every transaction behind this month's Spent, split parts included, read off
 * the same rows the budget engine totals, so the total here is the Spent figure
 * above to the cent. Each one opens its account's register on that transaction
 * (on the whole split, for a part of one), with the register's filters cleared
 * so the row is there to be found.
 */
function SpentSection({
  budgetId,
  categoryId,
  month,
}: {
  budgetId: number;
  categoryId: number;
  month: string;
}) {
  const { data } = trpc.budget.categoryTransactions.useQuery({ budgetId, categoryId, month });

  return (
    <section className="my-2 py-2 border-y border-border/50 bg-muted/30">
      <div className="flex items-baseline justify-between gap-2 px-4 mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transactions
        </h4>
        {data && (
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(data.total)}</span>
        )}
      </div>

      {!data && <p className="px-4 text-xs text-muted-foreground">Loading...</p>}
      {data?.transactions.length === 0 && (
        <p className="px-4 text-xs text-muted-foreground">Nothing spent here this month.</p>
      )}

      <ul>
        {data?.transactions.map((t) => (
          <li key={t.subTransactionId === null ? t.transactionId : `s${t.subTransactionId}`}>
            <Link
              to="/budgets/$budgetId/accounts/$accountId"
              params={{ budgetId: String(budgetId), accountId: String(t.accountId) }}
              search={{ cleared: "all", sort: "date", dir: "asc", txn: t.transactionId }}
              title="Open in its account's register"
              className="block px-4 py-1.5 hover:bg-accent transition-colors"
            >
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{t.payeeName ?? "No payee"}</span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    t.amount > 0 && "text-green-600 dark:text-green-500"
                  )}
                >
                  {formatCurrency(t.amount)}
                </span>
              </span>
              <span className="flex gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0 tabular-nums">{formatDateShort(t.date)}</span>
                <span className="truncate">
                  {t.accountName}
                  {t.memo ? `, ${t.memo}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  label,
  value,
  emphasis,
  tone,
}: {
  label: ReactNode;
  value: string;
  emphasis?: boolean;
  tone?: "good" | "warn" | "danger";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          emphasis ? "text-base font-semibold" : "text-sm",
          tone === "good" && "text-green-600 dark:text-green-500",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

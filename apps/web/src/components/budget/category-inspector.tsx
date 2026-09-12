import { useState } from "react";
import { X } from "lucide-react";
import { trpc } from "@/trpc";
import { cn, formatCurrency, parseAmountExpression } from "@/lib/utils";

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
  overspendKind: "cash" | "credit" | null;
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
 * recent history, and whether overspending is confined here.
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
  isMoving,
  moveError,
  onClose,
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
  isMoving: boolean;
  moveError: string | null;
  onClose: () => void;
}) {
  const { data: quick } = trpc.budget.quickBudget.useQuery({
    budgetId,
    categoryId: category.id,
    month,
  });
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
    <aside className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
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
      <dl className="px-4 py-3 space-y-1.5 border-b border-border">
        <Row label="Budgeted" value={formatCurrency(category.budgeted)} />
        <Row
          label="Spent"
          value={formatCurrency(category.activity)}
        />
        <Row
          label="Available"
          value={formatCurrency(category.available)}
          emphasis
          tone={
            category.available < 0
              ? category.overspendKind === "credit"
                ? "warn"
                : "danger"
              : category.available > 0
              ? "good"
              : undefined
          }
        />
        {category.available < 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            {category.overspendKind === "credit"
              ? "Overspent on credit. This carries as debt and does not reduce next month's To be Budgeted."
              : "Overspent in cash. This comes out of next month's To be Budgeted."}
          </p>
        )}
      </dl>

      <GoalSection goal={category.goal} onSetGoal={onSetGoal} month={month} />

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

      <HistorySection history={history} />

      {/* Overspending handling */}
      <section className="px-4 py-3">
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
    </aside>
  );
}

// ─── Goal ─────────────────────────────────────────────────────────────────────

function GoalSection({
  goal,
  month,
  onSetGoal,
}: {
  goal: CategoryGoal | null;
  month: string;
  onSetGoal: (goal: {
    goalType: GoalType | null;
    target?: number;
    targetMonth?: string;
  }) => void;
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
        {!editing && (
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

          <button
            onClick={() => onSetGoal({ goalType: null })}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove goal
          </button>
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
 * The last twelve months of budgeting and spending for this category, as paired
 * bars on a shared scale so over and under funding is visible at a glance.
 */
function HistorySection({
  history,
}: {
  history: Array<{ month: string; budgeted: number; spent: number }> | undefined;
}) {
  if (!history || history.length === 0) return null;

  const peak = Math.max(
    ...history.map((h) => Math.max(h.budgeted, h.spent)),
    1 // never divide by zero on a category that has never moved
  );

  return (
    <section className="px-4 py-3 border-b border-border">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Last 12 months
      </h4>
      <div className="space-y-1">
        {history.map((h) => (
          <div key={h.month} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
              {h.month}
            </span>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="h-1.5 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary/70"
                  style={{ width: `${(h.budgeted / peak) * 100}%` }}
                />
              </div>
              <div className="h-1.5 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-muted-foreground/60"
                  style={{ width: `${(h.spent / peak) * 100}%` }}
                />
              </div>
            </div>
            <span
              className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
              title={`Budgeted ${formatCurrency(h.budgeted)}, spent ${formatCurrency(h.spent)}`}
            >
              {formatCurrency(h.spent)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Upper bar budgeted, lower bar spent. Figures are the amount spent.
      </p>
    </section>
  );
}

function Row({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
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

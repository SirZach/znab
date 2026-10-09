import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/trpc";
import type { OverspendKind } from "@znab/shared";
import { cn, formatCurrency, parseAmountExpression } from "@/lib/utils";
import { ActionButton } from "@/components/common/action-button";
import { CloseIconButton } from "@/components/common/close-icon-button";
import { FieldSelect } from "@/components/common/field-select";
import { IconButton } from "@/components/common/icon-button";
import { MoneyInput } from "@/components/common/money-input";
import { SegmentedControl } from "@/components/common/segmented-control";
import { SidePanelSection } from "@/components/common/side-panel-section";
import { StatRow } from "@/components/common/stat-row";
import { GoalSection, type CategoryGoal, type GoalInput } from "@/components/budget/goal-section";
import { HistorySection } from "@/components/budget/history-section";
import { SpentSection } from "@/components/budget/spent-section";

export type { CategoryGoal } from "@/components/budget/goal-section";

export type InspectedCategory = {
  id: number;
  name: string;
  groupName: string;
  budgeted: number;
  activity: number;
  available: number;
  overspendKind: OverspendKind;
  confined: boolean;
  goal: CategoryGoal | null;
};

export type MoveSource = { id: number; name: string; groupName: string; available: number };

/** Which way money is moving relative to the selected category. */
type MoveDirection = "in" | "out";

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
  onSetGoal: (goal: GoalInput) => void;
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
        <IconButton onClick={onClose} aria-label="Back to the budget" className="-ml-2 md:hidden">
          <ChevronLeft size={20} />
        </IconButton>
        <div className="min-w-0 max-md:flex-1">
          <h3 className="font-semibold truncate">{category.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{category.groupName}</p>
        </div>
        <CloseIconButton onClick={onClose} />
      </div>

      {/* Where the category stands */}
      <div className="py-3 border-b border-border">
        <dl className="px-4 space-y-1.5">
          <StatRow label="Budgeted" value={formatCurrency(category.budgeted)} />
          <StatRow
            label={
              <button
                type="button"
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
          <StatRow
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
          <SidePanelSection title="Quick Budget">
            <div className="space-y-1">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
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
          </SidePanelSection>

          {/* Move money, either direction */}
          <SidePanelSection title="Move money">
            <SegmentedControl
              options={[
                { value: "in", label: shortfall > 0 ? "Cover from" : "Move in from" },
                { value: "out", label: "Move out to" },
              ]}
              value={direction}
              onChange={(value) => {
                setDirection(value);
                setAmount("");
              }}
              className="mb-2"
            />

            <div className="space-y-2">
              <FieldSelect
                id={`move-other-${category.id}`}
                aria-label={direction === "in" ? "Category to take from" : "Category to send to"}
                value={otherId}
                onChange={(e) => setOtherId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full"
              >
                <option value="">Choose a category...</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.groupName}: {s.name} ({formatCurrency(s.available)})
                  </option>
                ))}
              </FieldSelect>

              <div className="flex gap-2">
                <MoneyInput
                  id={`move-amount-${category.id}`}
                  aria-label="Amount to move"
                  value={amountValue}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 min-w-0"
                />
                <ActionButton
                  disabled={!canMove}
                  onClick={() => {
                    if (otherId === "" || parsedAmount === null) return;
                    onMoveMoney(otherId, parsedAmount, direction);
                    setAmount("");
                    setOtherId("");
                  }}
                >
                  {isMoving ? "Moving..." : "Move"}
                </ActionButton>
              </div>

              {moveError && <p className="text-xs text-destructive">{moveError}</p>}
            </div>
          </SidePanelSection>
        </>
      )}

      <HistorySection history={history} />

      {!readOnly && (
        <>
          {/* Overspending handling */}
          <SidePanelSection>
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
          </SidePanelSection>

          <SidePanelSection bordered={false}>
            <ActionButton variant="outline" onClick={onHide} className="w-full">
              Hide this category
            </ActionButton>
            <p className="text-xs text-muted-foreground mt-2">
              It moves to Hidden Categories at the foot of the grid. Past months keep
              whatever was budgeted and spent here.
            </p>
          </SidePanelSection>
        </>
      )}
    </aside>
  );
}

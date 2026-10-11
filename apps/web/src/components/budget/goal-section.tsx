import { useState } from "react";
import type { GoalType } from "@znab/shared";
import { cn, formatCurrency, parseAmountExpression } from "@/lib/utils";
import { ActionButton } from "@/components/common/action-button";
import { FieldInput } from "@/components/common/field-input";
import { FieldSelect } from "@/components/common/field-select";
import { MoneyInput } from "@/components/common/money-input";
import { SectionHeading } from "@/components/common/section-heading";
import { SidePanelSection } from "@/components/common/side-panel-section";

export type CategoryGoal = {
  type: GoalType;
  target: number;
  targetMonth: string | null;
  neededThisMonth: number;
  underFunded: number;
  percent: number;
};

/** What saving or removing a goal sends. */
export type GoalInput = {
  goalType: GoalType | null;
  target?: number;
  targetMonth?: string;
};

const GOAL_LABELS: Record<GoalType, string> = {
  TB: "Target balance",
  TBD: "Target balance by date",
  MF: "Monthly funding",
};

/** The category's goal: its progress, and an editor to add, change or remove it. */
export function GoalSection({
  goal,
  month,
  onSetGoal,
  readOnly,
}: {
  goal: CategoryGoal | null;
  month: string;
  onSetGoal: (goal: GoalInput) => void;
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
    <SidePanelSection>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <SectionHeading>Goal</SectionHeading>
        {!editing && !readOnly && (
          <button
            type="button"
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
                goal.underFunded > 0 ? "text-warning" : "text-muted-foreground"
              )}
            >
              {goal.underFunded > 0
                ? `${formatCurrency(goal.underFunded)} short`
                : "On track"}
            </span>
          </div>

          {!readOnly && (
            <button
              type="button"
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
          <FieldSelect
            aria-label="Goal type"
            value={type}
            onChange={(e) => setType(e.target.value as GoalType)}
            className="w-full"
          >
            <option value="MF">Monthly funding</option>
            <option value="TB">Target balance</option>
            <option value="TBD">Target balance by date</option>
          </FieldSelect>

          <MoneyInput
            aria-label="Goal amount"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full"
          />

          {type === "TBD" && (
            <FieldInput
              type="month"
              aria-label="Target month"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              className="w-full"
            />
          )}

          <div className="flex gap-2">
            <ActionButton disabled={!canSave} onClick={save} className="flex-1">
              Save goal
            </ActionButton>
            <ActionButton variant="outline" onClick={() => setEditing(false)} className="px-3">
              Cancel
            </ActionButton>
          </div>
        </div>
      )}
    </SidePanelSection>
  );
}

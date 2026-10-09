import { useState } from "react";
import { formatCurrency, parseAmountExpression } from "@/lib/utils";
import { ActionButton } from "@/components/common/action-button";
import { MoneyInput } from "@/components/common/money-input";
import { SidePanel } from "@/components/common/side-panel";
import { SidePanelHeader } from "@/components/common/side-panel-header";
import { SidePanelSection } from "@/components/common/side-panel-section";

/**
 * Shown in place of the single-category inspector when several categories are
 * selected, so a row of envelopes can be funded in one pass.
 */
export function BulkBudgetPanel({
  categories,
  onBudgetAll,
  onClear,
}: {
  categories: Array<{ id: number; name: string; groupName: string; budgeted: number }>;
  onBudgetAll: (amount: number) => void;
  onClear: () => void;
}) {
  const [amount, setAmount] = useState("");
  const parsed = parseAmountExpression(amount);
  const total = categories.reduce((sum, c) => sum + c.budgeted, 0);

  function apply(value: number) {
    onBudgetAll(value);
    setAmount("");
  }

  return (
    <SidePanel>
      <SidePanelHeader
        title={`${categories.length} categories selected`}
        subtitle={`${formatCurrency(total)} budgeted between them`}
        subtitleClassName="tabular-nums"
        onClose={onClear}
        closeLabel="Clear selection"
      />

      <SidePanelSection title="Budget each of them">
        <div className="flex gap-2">
          <MoneyInput
            id="bulk-amount"
            aria-label="Amount to budget to each selected category"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onEnter={apply}
            className="flex-1 min-w-0"
          />
          <ActionButton
            disabled={parsed === null}
            onClick={() => parsed !== null && apply(parsed)}
          >
            Apply
          </ActionButton>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Sets every selected category to this amount. Arithmetic works here too.
        </p>
        <ActionButton variant="outline" onClick={() => onBudgetAll(0)} className="mt-2 w-full">
          Set them all to zero
        </ActionButton>
      </SidePanelSection>

      <SidePanelSection title="Selected" bordered={false}>
        <ul className="space-y-1">
          {categories.map((c) => (
            <li key={c.id} className="flex justify-between gap-2 text-sm">
              <span className="truncate text-muted-foreground">
                {c.groupName}: {c.name}
              </span>
              <span className="tabular-nums shrink-0">{formatCurrency(c.budgeted)}</span>
            </li>
          ))}
        </ul>
      </SidePanelSection>
    </SidePanel>
  );
}

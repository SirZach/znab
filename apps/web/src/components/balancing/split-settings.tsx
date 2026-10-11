import { useState } from "react";
import { trpc, type HouseholdSplitOutputs } from "@/trpc";
import { validSplitSettings } from "@/lib/household-split";
import { BudgetSelect } from "@/components/balancing/budget-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Which two budgets are split, the savings percent, and which of each budget's
 * groups count as master budgets. Remount it on a saved change to start the
 * form from what was saved.
 */
export function SplitSettings({
  settings,
  prompt,
}: {
  settings: HouseholdSplitOutputs["settings"];
  prompt: boolean;
}) {
  const utils = trpc.useUtils();
  const [primaryId, setPrimaryId] = useState<number | null>(settings.primaryBudgetId);
  const [partnerId, setPartnerId] = useState<number | null>(settings.partnerBudgetId);
  const [percent, setPercent] = useState(String(settings.savingsPercent));

  const onSuccess = () => utils.householdSplit.invalidate();
  const update = trpc.householdSplit.updateSettings.useMutation({ onSuccess });
  const setFlag = trpc.householdSplit.setGroupFlag.useMutation({ onSuccess });

  const canSave = validSplitSettings({ primaryId, partnerId, percent });
  const budgetItems = settings.budgets.map((b) => ({ value: b.id, label: b.name }));

  const chosen = [primaryId, partnerId]
    .map((id) => settings.budgets.find((b) => b.id === id))
    .filter((b) => b !== undefined);

  return (
    <div className="space-y-4 border-t border-border pt-4">
      {prompt && (
        <p className="text-sm text-muted-foreground">
          Choose the two budgets to split and which of their groups count as master budgets.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <BudgetSelect
          id="primary-budget"
          label="Primary budget"
          items={budgetItems}
          value={primaryId}
          onChange={setPrimaryId}
        />
        <BudgetSelect
          id="partner-budget"
          label="Partner budget"
          items={budgetItems}
          value={partnerId}
          onChange={setPartnerId}
        />
        <div className="space-y-1.5">
          <Label htmlFor="savings-percent" className="text-muted-foreground">
            Savings percent
          </Label>
          <Input
            id="savings-percent"
            type="number"
            min={0}
            max={100}
            step="any"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className="text-right tabular-nums"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {update.error && <p className="text-xs text-destructive">{update.error.message}</p>}
        <Button
          size="sm"
          disabled={!canSave || update.isPending}
          onClick={() =>
            update.mutate({
              primaryBudgetId: Number(primaryId),
              partnerBudgetId: Number(partnerId),
              savingsPercent: Number(percent),
            })
          }
        >
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {chosen.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {chosen.map((b) => (
            <fieldset key={b.id} className="space-y-2">
              <legend className="mb-1 text-sm font-medium">{b.name} master budgets</legend>
              {b.groups.map((g) => (
                <Label key={g.id} className="font-normal cursor-pointer">
                  <Checkbox
                    checked={g.inMasterBudgets}
                    disabled={setFlag.isPending}
                    onCheckedChange={(checked) =>
                      setFlag.mutate({ budgetId: b.id, groupId: g.id, inMasterBudgets: checked })
                    }
                  />
                  {g.name}
                </Label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}

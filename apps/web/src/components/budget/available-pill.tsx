import type { OverspendKind } from "@znab/shared";
import { availableStatus, type AvailableStatus } from "@/lib/budget-grid";
import { cn, formatCurrency } from "@/lib/utils";

const TONE: Record<AvailableStatus, string> = {
  confined: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  overspent: "bg-destructive/15 text-destructive",
  funded: "text-green-600 dark:text-green-500",
  empty: "text-muted-foreground",
};

const TITLE: Partial<Record<AvailableStatus, string>> = {
  confined:
    "Overspending confined to this category. It carries forward and does not reduce next month's To be Budgeted",
  overspent: "Overspent. This comes out of next month's To be Budgeted",
};

/**
 * A category's month-end balance. Red when the overspending will come out of
 * next month's To-be-Budgeted, amber when the category is confined and carries
 * it forward instead.
 */
export function AvailablePill({
  amount,
  overspendKind,
}: {
  amount: number;
  overspendKind: OverspendKind;
}) {
  const status = availableStatus(amount, overspendKind);

  return (
    <span
      title={TITLE[status]}
      className={cn("inline-block rounded px-2 py-0.5 font-medium tabular-nums", TONE[status])}
    >
      {formatCurrency(amount)}
    </span>
  );
}

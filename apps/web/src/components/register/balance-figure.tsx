import { cn, formatCurrency } from "@/lib/utils";

/**
 * One labelled amount. Shared between the register's header and the reconcile
 * panel so the figures a reader compares are set the same way rather than two
 * near-identical ways.
 */
export function BalanceFigure({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  /** Applied to the amount, for the one figure that leads its group. */
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm tabular-nums", className)}>{formatCurrency(value)}</dd>
    </div>
  );
}

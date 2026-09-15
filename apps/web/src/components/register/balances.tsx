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

/**
 * What the account is worth, three ways, as YNAB 4 puts it: what the bank has
 * agreed to, what it has not seen yet, and the sum of the two. That last one is
 * what the account is actually worth, so it is the one set in bold.
 */
export function AccountBalances({
  cleared,
  uncleared,
  working,
}: {
  cleared: number;
  uncleared: number;
  working: number;
}) {
  return (
    <dl className="flex items-end gap-6 text-right">
      <BalanceFigure label="Cleared" value={cleared} className="text-muted-foreground" />
      <BalanceFigure label="Uncleared" value={uncleared} className="text-muted-foreground" />
      <BalanceFigure label="Working" value={working} className="text-lg font-semibold" />
    </dl>
  );
}

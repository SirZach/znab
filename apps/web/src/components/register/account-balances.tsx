import { BalanceFigure } from "@/components/register/balance-figure";

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

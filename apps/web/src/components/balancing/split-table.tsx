import type { HouseholdSplitOutputs } from "@/trpc";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type MonthSplit = Extract<HouseholdSplitOutputs["month"], { configured: true }>;

/** Each budget's income and master budgets for the month, then what is left to split. */
export function SplitTable({ split }: { split: MonthSplit }) {
  const summary: [string, number][] = [
    ["Amount Left Over", split.leftOver],
    [`Saving (${split.savingsPercent}%)`, split.saving],
    [`${split.primary.name} Amount Left Over`, split.primaryLeftOver],
    [`${split.partner.name} Amount Left Over`, split.partnerLeftOver],
  ];

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead className="text-right">Income</TableHead>
            <TableHead className="text-right">Master Budgets</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[split.primary, split.partner].map((p) => (
            <TableRow key={p.budgetId}>
              <TableCell>{p.name}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(p.income)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(p.master)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(split.incomeTotal)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(split.masterTotal)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <dl className="space-y-1 text-sm">
        {summary.map(([label, amount]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn("tabular-nums font-medium", amount < 0 && "text-destructive")}>
              {formatCurrency(amount)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

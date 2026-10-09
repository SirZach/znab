import type { MonthSummary } from "@/trpc";
import { formatDeduction, formatIncome } from "@/lib/budget-grid";
import { formatCurrency } from "@/lib/utils";
import { BudgetStat } from "./budget-stat";

/**
 * The Available-to-Budget breakdown. Each figure is shown as its signed
 * contribution so the row literally sums to Available to Budget.
 */
export function BudgetSummary({
  summary,
  monthShort,
  prevShort,
}: {
  summary: MonthSummary;
  monthShort: string;
  prevShort: string;
}) {
  const {
    notBudgeted,
    overspentPrev,
    income,
    budgeted,
    budgetedFuture,
    availableToBudget: avail,
  } = summary;
  const availColor =
    avail > 0 ? "text-green-500" : avail < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="flex flex-wrap items-stretch gap-x-4 md:gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-3 md:px-4 py-3">
      <BudgetStat label={`Not Budgeted in ${prevShort}`} text={formatCurrency(notBudgeted)} danger={notBudgeted < 0} />
      <BudgetStat label={`Overspent in ${prevShort}`} text={formatDeduction(overspentPrev)} warn={overspentPrev > 0} />
      <BudgetStat label={`Income for ${monthShort}`} text={formatIncome(income)} />
      <BudgetStat label={`Budgeted in ${monthShort}`} text={formatDeduction(budgeted)} />
      {/* Only shown once money is committed ahead, as in YNAB 4. */}
      {budgetedFuture !== 0 && (
        <BudgetStat label="Budgeted in Future" text={formatDeduction(budgetedFuture)} warn={budgetedFuture > 0} />
      )}
      <div className="ml-auto flex flex-col items-end justify-center border-l border-border pl-6">
        <span className={`text-xl font-bold tabular-nums ${availColor}`}>{formatCurrency(avail)}</span>
        <span className="text-xs text-muted-foreground">Available to Budget</span>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { budgetSearchSchema } from "@znab/shared";
import { useBudgetMonths } from "@/hooks/useBudgetMonths";
import { BudgetGrid } from "@/components/budget/budget-grid";
import { MonthPicker } from "@/components/budget/month-picker";

export const Route = createFileRoute("/budgets/$budgetId/")({
  validateSearch: budgetSearchSchema,
  component: BudgetPage,
});

function BudgetPage() {
  const { budgetId } = Route.useParams();
  const { month } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const selectMonth = (m: string) => navigate({ search: { month: m } });

  const { availableMonths } = useBudgetMonths({ budgetId: Number(budgetId) });

  // No month param → show month picker
  if (!month) {
    return <MonthPicker months={availableMonths} onSelect={selectMonth} />;
  }

  return <BudgetGrid budgetId={Number(budgetId)} month={month} onMonthChange={selectMonth} />;
}

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { budgetSearchSchema } from "@znab/shared";
import { BudgetGrid } from "@/components/budget/budget-grid";
import { currentMonthParam } from "@/lib/utils";

export const Route = createFileRoute("/budgets/$budgetId/")({
  validateSearch: budgetSearchSchema,
  // Opening a budget lands on the current month.
  beforeLoad: ({ search, params }) => {
    if (!search.month) {
      throw redirect({
        to: "/budgets/$budgetId",
        params,
        search: { month: currentMonthParam() },
        replace: true,
      });
    }
  },
  component: BudgetPage,
});

function BudgetPage() {
  const { budgetId } = Route.useParams();
  const { month } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const selectMonth = (m: string) => navigate({ search: { month: m } });

  if (!month) return null;

  return <BudgetGrid budgetId={Number(budgetId)} month={month} onMonthChange={selectMonth} />;
}

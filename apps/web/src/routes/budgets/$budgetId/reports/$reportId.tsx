import { createFileRoute } from "@tanstack/react-router";
import { NetWorthReport } from "@/components/reports/net-worth-report";
import { SpendingByCategoryReport } from "@/components/reports/spending-by-category-report";
import { IncomeVsExpenseReport } from "@/components/reports/income-vs-expense-report";
import { SpendingByPayeeReport } from "@/components/reports/spending-by-payee-report";

export const Route = createFileRoute(
  "/budgets/$budgetId/reports/$reportId"
)({
  component: ReportPage,
});

function ReportPage() {
  const { budgetId, reportId } = Route.useParams();

  switch (reportId) {
    case "spending":
      return <SpendingByCategoryReport budgetId={Number(budgetId)} />;
    case "spending-by-payee":
      return <SpendingByPayeeReport budgetId={Number(budgetId)} />;
    case "income-vs-expenses":
      return <IncomeVsExpenseReport budgetId={Number(budgetId)} />;
    case "net-worth":
      return <NetWorthReport budgetId={Number(budgetId)} />;
    default:
      return (
        <div className="p-8">
          <p className="text-muted-foreground">Unknown report: {reportId}</p>
        </div>
      );
  }
}


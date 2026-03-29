import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart2, TrendingUp, Landmark } from "lucide-react";

export const Route = createFileRoute("/budgets/$budgetId/reports/")({
  component: ReportsLauncherPage,
});

const REPORTS = [
  {
    id: "spending",
    label: "Spending by Category",
    description: "See where your money goes each month",
    icon: BarChart2,
  },
  {
    id: "income-vs-expenses",
    label: "Income vs. Expenses",
    description: "Compare income and outflow over time",
    icon: TrendingUp,
  },
  {
    id: "net-worth",
    label: "Net Worth",
    description: "Track your net worth across all accounts",
    icon: Landmark,
  },
] as const;

function ReportsLauncherPage() {
  const { budgetId } = Route.useParams();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reports</h2>
        <p className="text-muted-foreground mt-1">Analyze your financial data</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.id}
              to="/budgets/$budgetId/reports/$reportId"
              params={{ budgetId, reportId: report.id }}
              className="flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary hover:bg-accent"
            >
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <Icon size={20} />
              </div>
              <div>
                <div className="font-medium">{report.label}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {report.description}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

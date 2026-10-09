import { createFileRoute, Link } from "@tanstack/react-router";
import { REPORTS } from "@/lib/reports";

export const Route = createFileRoute("/budgets/$budgetId/reports/")({
  component: ReportsLauncherPage,
});

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

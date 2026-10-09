import { createFileRoute } from "@tanstack/react-router";
import { findReport } from "@/lib/reports";

export const Route = createFileRoute("/budgets/$budgetId/reports/$reportId")({
  component: ReportPage,
});

function ReportPage() {
  const { budgetId, reportId } = Route.useParams();
  const report = findReport(reportId);

  if (!report) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Unknown report: {reportId}</p>
      </div>
    );
  }
  const Report = report.component;
  return <Report budgetId={Number(budgetId)} />;
}

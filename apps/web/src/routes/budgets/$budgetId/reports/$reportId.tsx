import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/budgets/$budgetId/reports/$reportId"
)({
  component: ReportPage,
});

function ReportPage() {
  const { reportId } = Route.useParams();

  switch (reportId) {
    case "spending":
      return <SpendingReport />;
    case "income-vs-expenses":
      return <IncomeVsExpensesReport />;
    case "net-worth":
      return <NetWorthReport />;
    default:
      return (
        <div className="p-8">
          <p className="text-muted-foreground">Unknown report: {reportId}</p>
        </div>
      );
  }
}

// ─── Report stubs (to be implemented) ────────────────────────────────────────

function SpendingReport() {
  return (
    <ReportShell title="Spending by Category">
      <p className="text-muted-foreground">Charts coming soon.</p>
    </ReportShell>
  );
}

function IncomeVsExpensesReport() {
  return (
    <ReportShell title="Income vs. Expenses">
      <p className="text-muted-foreground">Charts coming soon.</p>
    </ReportShell>
  );
}

function NetWorthReport() {
  return (
    <ReportShell title="Net Worth">
      <p className="text-muted-foreground">Charts coming soon.</p>
    </ReportShell>
  );
}

function ReportShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </div>
  );
}

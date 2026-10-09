import { createFileRoute, Link } from "@tanstack/react-router";
import { CenteredMessage } from "@/components/common/centered-message";
import { useBudgetList } from "@/hooks/useBudgetList";
import { requireUser } from "@/lib/require-user";

export const Route = createFileRoute("/budgets/")({
  beforeLoad: requireUser,
  component: BudgetListPage,
});

function BudgetListPage() {
  const { budgets, isLoading } = useBudgetList();

  if (isLoading) {
    return <CenteredMessage className="min-h-screen bg-background">Loading budgets…</CenteredMessage>;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground">Your Budgets</h1>
          <p className="text-muted-foreground">Select a budget to open it.</p>
        </div>

        <div className="grid gap-3">
          {budgets?.map((budget) => (
            <Link
              key={budget.id}
              to="/budgets/$budgetId"
              params={{ budgetId: String(budget.id) }}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary hover:bg-accent"
            >
              <span className="font-medium text-card-foreground">{budget.name}</span>
              <span className="text-muted-foreground text-sm">→</span>
            </Link>
          ))}
        </div>

        <Link
          to="/budgets/balancing"
          className="flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary hover:bg-accent"
        >
          <span className="font-medium text-card-foreground">Household Balancing</span>
          <span className="text-muted-foreground text-sm">→</span>
        </Link>
      </div>
    </div>
  );
}

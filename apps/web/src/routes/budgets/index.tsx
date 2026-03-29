import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useBudgetList } from "@/hooks/useBudgetList";

export const Route = createFileRoute("/budgets/")({
  beforeLoad: ({ context }) => {
    if (!context.userSlug) {
      throw redirect({ to: "/" });
    }
  },
  component: BudgetListPage,
});

function BudgetListPage() {
  const { budgets, isLoading } = useBudgetList();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading budgets…</p>
      </div>
    );
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
      </div>
    </div>
  );
}

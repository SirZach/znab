/**
 * Budget shell layout: renders the sidebar plus an <Outlet />.
 * All routes under /budgets/$budgetId/* share this layout.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useBudgetLayout } from "@/hooks/useBudgetLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { requireUser } from "@/lib/require-user";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BudgetSidebar } from "@/components/layout/budget-sidebar";

export const Route = createFileRoute("/budgets/$budgetId")({
  beforeLoad: requireUser,
  component: BudgetLayout,
});

function BudgetLayout() {
  const { budgetId } = Route.useParams();
  const { budget, onBudgetAccounts, trackingAccounts, closedAccounts, handleSignOut } =
    useBudgetLayout({ budgetId: Number(budgetId) });
  const isMobile = useIsMobile();
  const budgetName = budget?.name ?? "Budget";

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <BudgetSidebar
        budgetId={budgetId}
        budgetName={budgetName}
        isMobile={isMobile}
        onBudgetAccounts={onBudgetAccounts}
        trackingAccounts={trackingAccounts}
        closedAccounts={closedAccounts}
        onSignOut={handleSignOut}
      />

      <SidebarInset className="overflow-y-auto">
        {/* The only way to the sidebar on a phone, where it is hidden */}
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2 md:hidden">
          <SidebarTrigger />
          <span className="font-semibold truncate">{budgetName}</span>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

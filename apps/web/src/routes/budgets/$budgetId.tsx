/**
 * Budget shell layout — renders the shadcn sidebar + <Outlet />.
 * All routes under /budgets/$budgetId/* share this layout.
 */
import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useParams,
} from "@tanstack/react-router";
import { useBudgetLayout } from "@/hooks/useBudgetLayout";
import { cn, currentMonthParam } from "@/lib/utils";
import {
  LayoutDashboard,
  BarChart2,
  CreditCard,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/budgets/$budgetId")({
  beforeLoad: ({ context }) => {
    if (!context.userSlug) {
      throw redirect({ to: "/" });
    }
  },
  component: BudgetLayout,
});

function BudgetLayout() {
  const { budgetId } = useParams({ from: "/budgets/$budgetId" });
  const { queryClient } = Route.useRouteContext();

  const { budget, onBudgetAccounts, trackingAccounts, handleSignOut } = useBudgetLayout({
    budgetId: Number(budgetId),
    queryClient,
  });

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="flex w-64 flex-col border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground shrink-0">
        {/* Budget name header */}
        <div className="flex h-14 items-center px-4 border-b border-sidebar-border">
          <span className="font-semibold truncate">{budget?.name ?? "Budget"}</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Budget link */}
          <SidebarLink
            to="/budgets/$budgetId"
            params={{ budgetId }}
            search={{ month: currentMonthParam() }}
            icon={<LayoutDashboard size={16} />}
            label="Budget"
          />

          {/* Reports link */}
          <SidebarLink
            to="/budgets/$budgetId/reports"
            params={{ budgetId }}
            icon={<BarChart2 size={16} />}
            label="Reports"
          />

          {/* On-budget accounts */}
          {onBudgetAccounts.length > 0 && (
            <AccountGroup
              label="Budget Accounts"
              accounts={onBudgetAccounts}
              budgetId={budgetId}
            />
          )}

          {/* Tracking accounts */}
          {trackingAccounts.length > 0 && (
            <AccountGroup
              label="Tracking Accounts"
              accounts={trackingAccounts}
              budgetId={budgetId}
            />
          )}
        </nav>

        {/* Sign-out footer */}
        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut size={14} />
            Switch user
          </button>
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

function SidebarLink({
  to,
  params,
  search,
  icon,
  label,
}: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      params={params}
      search={search}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
    >
      {icon}
      {label}
    </Link>
  );
}

function AccountGroup({
  label,
  accounts,
  budgetId,
}: {
  label: string;
  accounts: Array<{ id: number; name: string }>;
  budgetId: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
      >
        <ChevronDown
          size={12}
          className={cn("transition-transform", !open && "-rotate-90")}
        />
        {label}
      </button>

      {open &&
        accounts.map((account) => (
          <Link
            key={account.id}
            to="/budgets/$budgetId/accounts/$accountId"
            params={{ budgetId, accountId: String(account.id) }}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pl-6"
            activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
          >
            <CreditCard size={13} className="shrink-0 opacity-60" />
            <span className="truncate">{account.name}</span>
          </Link>
        ))}
    </div>
  );
}

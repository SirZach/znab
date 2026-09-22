/**
 * Budget shell layout: renders the sidebar plus an <Outlet />.
 * All routes under /budgets/$budgetId/* share this layout.
 */
import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useParams,
  type LinkProps,
} from "@tanstack/react-router";
import { useBudgetLayout } from "@/hooks/useBudgetLayout";
import { useUserStore } from "@/store/user";
import { cn, currentMonthParam, formatCurrency } from "@/lib/utils";
import {
  LayoutDashboard,
  BarChart2,
  CalendarClock,
  CreditCard,
  LogOut,
  ChevronDown,
  Plus,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/budgets/$budgetId")({
  beforeLoad: () => {
    if (!useUserStore.getState().userSlug) {
      throw redirect({ to: "/" });
    }
  },
  component: BudgetLayout,
});

function BudgetLayout() {
  const { budgetId } = useParams({ from: "/budgets/$budgetId" });
  const { queryClient } = Route.useRouteContext();

  const {
    budget,
    onBudgetAccounts,
    trackingAccounts,
    closedAccounts,
    handleSignOut,
  } = useBudgetLayout({
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

          {/* Payees link */}
          <SidebarLink
            to="/budgets/$budgetId/payees"
            params={{ budgetId }}
            icon={<Users size={16} />}
            label="Payees"
          />

          {/* Categories link */}
          <SidebarLink
            to="/budgets/$budgetId/categories"
            params={{ budgetId }}
            icon={<Tags size={16} />}
            label="Categories"
          />

          {/* Scheduled transactions link */}
          <SidebarLink
            to="/budgets/$budgetId/scheduled"
            params={{ budgetId }}
            icon={<CalendarClock size={16} />}
            label="Scheduled"
          />

          {/* Manage accounts link */}
          <SidebarLink
            to="/budgets/$budgetId/accounts"
            params={{ budgetId }}
            icon={<Wallet size={16} />}
            label="Accounts"
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

          {/* Closed accounts, collapsed: kept for their history, not in use */}
          {closedAccounts.length > 0 && (
            <AccountGroup
              label={`Closed Accounts (${closedAccounts.length})`}
              accounts={closedAccounts}
              budgetId={budgetId}
              defaultOpen={false}
            />
          )}

          {/* The form for a new account lives on the manage screen, so this is
              the same destination as the link above, reached from where the
              accounts are. */}
          <Link
            to="/budgets/$budgetId/accounts"
            params={{ budgetId }}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <Plus size={14} />
            Add account
          </Link>
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

/**
 * A section link, highlighted while that section is the one being looked at.
 *
 * Two things here are deliberate. The destination is typed as the router types
 * it rather than as a plain string, which is what the router needs in order to
 * check a link and its parameters at all; spelling it `string` had quietly
 * turned that checking off, and is why nothing caught the fault below.
 *
 * And a link is matched on its path alone. A match includes the search
 * parameters by default, which reads well until a section carries any: the
 * Budget link is built with this month, so standing on any other month stopped
 * it matching the URL it had led to, and the register applies defaults for its
 * filter and sort, so those links never matched either. Whether a section is
 * the current one is a question about the path, so that is what decides it.
 */
function SidebarLink({
  icon,
  label,
  ...link
}: LinkProps & {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      {...link}
      activeOptions={{ includeSearch: false }}
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
  defaultOpen = true,
}: {
  label: string;
  accounts: Array<{ id: number; name: string; balance: number }>;
  budgetId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // What the section is worth, which is the figure the sidebar was missing.
  // Summed from the same balances the rows show, so the two cannot disagree.
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);

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
        <span className="truncate">{label}</span>
        {/* Kept on the header while the section is shut, since a closed group
            that still says what it holds is the point of collapsing one. */}
        <span className="ml-auto shrink-0 tabular-nums normal-case tracking-normal">
          {formatCurrency(total)}
        </span>
      </button>

      {open &&
        accounts.map((account) => (
          <Link
            key={account.id}
            to="/budgets/$budgetId/accounts/$accountId"
            params={{ budgetId, accountId: String(account.id) }}
            // The register applies defaults for its filter and its sort, so its
            // URL always carries search parameters this link does not, and a
            // match that counted them would never hold.
            activeOptions={{ includeSearch: false }}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pl-6"
            activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
          >
            <CreditCard size={13} className="shrink-0 opacity-60" />
            <span className="truncate">{account.name}</span>
            <span className="ml-auto shrink-0 text-xs tabular-nums opacity-70">
              {formatCurrency(account.balance)}
            </span>
          </Link>
        ))}
    </div>
  );
}

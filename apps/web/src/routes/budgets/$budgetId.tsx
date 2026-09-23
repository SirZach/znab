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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  BarChart2,
  CalendarClock,
  LogOut,
  ChevronDown,
  Plus,
  Layers,
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
    <SidebarProvider className="h-svh overflow-hidden">
      {/* Always shown at every width: no collapsing and no mobile sheet */}
      <Sidebar collapsible="none" className="border-r border-sidebar-border">
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-4">
          <span className="font-semibold truncate">{budget?.name ?? "Budget"}</span>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <NavItem
                to="/budgets/$budgetId"
                params={{ budgetId }}
                search={{ month: currentMonthParam() }}
                // Every other section sits under this path, so a prefix match would
                // leave Budget lit on all of them.
                activeOptions={{ exact: true }}
                icon={<LayoutDashboard />}
                label="Budget"
              />
              <NavItem
                to="/budgets/$budgetId/reports"
                params={{ budgetId }}
                icon={<BarChart2 />}
                label="Reports"
              />
              <NavItem
                to="/budgets/$budgetId/payees"
                params={{ budgetId }}
                icon={<Users />}
                label="Payees"
              />
              <NavItem
                to="/budgets/$budgetId/categories"
                params={{ budgetId }}
                icon={<Tags />}
                label="Categories"
              />
              <NavItem
                to="/budgets/$budgetId/scheduled"
                params={{ budgetId }}
                icon={<CalendarClock />}
                label="Scheduled"
              />
              <NavItem
                to="/budgets/$budgetId/accounts"
                params={{ budgetId }}
                // All Accounts and every individual register sit under this
                // path, and each of them has its own row in the sidebar, so a
                // prefix match here would light two things at once.
                activeOptions={{ exact: true }}
                icon={<Wallet />}
                label="Accounts"
              />
              {/* Every account's transactions in one register, where YNAB 4
                  puts it: across the accounts rather than inside any one. */}
              <NavItem
                to="/budgets/$budgetId/accounts/all"
                params={{ budgetId }}
                icon={<Layers />}
                label="All Accounts"
              />
            </SidebarMenu>
          </SidebarGroup>

          {/* On-budget accounts */}
          {onBudgetAccounts.length > 0 && (
            <AccountGroup
              label="Budget Accounts"
              accounts={onBudgetAccounts}
              budgetId={budgetId}
            />
          )}

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
              the same destination as the Accounts link, reached from where the
              accounts are. */}
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-sidebar-foreground/70"
                  render={<Link to="/budgets/$budgetId/accounts" params={{ budgetId }} />}
                >
                  <Plus />
                  <span>Add account</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="text-sidebar-foreground/70" onClick={handleSignOut}>
                <LogOut />
                <span>Switch user</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="overflow-y-auto">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

/**
 * A section link, highlighted while that section is the one being looked at.
 *
 * The destination is typed as the router types it rather than as a plain
 * string, so the router still checks the link and its parameters.
 *
 * A link is matched on its path alone. A match includes the search parameters
 * by default, but the Budget link is built with this month and the register
 * applies defaults for its filter and sort, so counting them would leave those
 * sections unlit on the very pages they lead to.
 */
function NavItem({
  icon,
  label,
  activeOptions,
  ...link
}: LinkProps & {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={
          <Link
            {...link}
            // A prefix match is what a section wants: an account's own register
            // is still Accounts. Budget, the parent of the rest, opts out.
            activeOptions={{ includeSearch: false, ...activeOptions }}
            activeProps={{ "data-active": true }}
          />
        }
      >
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
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
    <SidebarGroup className="py-0">
      <SidebarGroupLabel
        render={<button onClick={() => setOpen((o) => !o)} />}
        className="w-full gap-1 font-semibold uppercase tracking-wider hover:text-sidebar-foreground"
      >
        <ChevronDown className={cn("transition-transform", !open && "-rotate-90")} />
        <span className="truncate">{label}</span>
        {/* Kept on the header while the section is shut, since a closed group
            that still says what it holds is the point of collapsing one. */}
        <span className="ml-auto shrink-0 tabular-nums normal-case tracking-normal">
          {formatCurrency(total)}
        </span>
      </SidebarGroupLabel>

      {open && (
        <SidebarMenuSub className="mr-0 pr-0">
          {accounts.map((account) => (
            <SidebarMenuSubItem key={account.id}>
              <SidebarMenuSubButton
                render={
                  <Link
                    to="/budgets/$budgetId/accounts/$accountId"
                    params={{ budgetId, accountId: String(account.id) }}
                    // The register applies defaults for its filter and its sort, so its
                    // URL always carries search parameters this link does not, and a
                    // match that counted them would never hold.
                    activeOptions={{ includeSearch: false }}
                    activeProps={{ "data-active": true }}
                  />
                }
              >
                <span className="truncate">{account.name}</span>
                <span className="ml-auto shrink-0 text-xs tabular-nums opacity-70">
                  {formatCurrency(account.balance)}
                </span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarGroup>
  );
}

import { Link } from "@tanstack/react-router";
import {
  BarChart2,
  CalendarClock,
  LayoutDashboard,
  Layers,
  LogOut,
  Plus,
  Scale,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { currentMonthParam } from "@/lib/utils";
import { BackToBudgets } from "./back-to-budgets";
import { NavItem } from "./nav-item";
import { SidebarAccountGroup, type SidebarAccount } from "./sidebar-account-group";

/** The budget's sections and accounts, beside every page under a budget. */
export function BudgetSidebar({
  budgetId,
  budgetName,
  isMobile,
  onBudgetAccounts,
  trackingAccounts,
  closedAccounts,
  onSignOut,
}: {
  budgetId: string;
  budgetName: string;
  isMobile: boolean;
  onBudgetAccounts: SidebarAccount[];
  trackingAccounts: SidebarAccount[];
  closedAccounts: SidebarAccount[];
  onSignOut: () => void;
}) {
  return (
    // Always shown on a desktop, with no collapsing. A phone has no room for
    // it beside the page, so there it is a sheet opened from the top bar.
    <Sidebar
      collapsible={isMobile ? "offcanvas" : "none"}
      className="border-r border-sidebar-border"
    >
      <SidebarHeader className="h-14 flex-row items-center gap-1 border-b border-sidebar-border px-2">
        <BackToBudgets />
        <span className="font-semibold truncate">{budgetName}</span>
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
            {/* A phone gets the budget and the reports only. The rest is
                bookkeeping that wants a desktop. */}
            {!isMobile && (
              <>
                {/* Shared across budgets, so it lives outside this layout */}
                <NavItem to="/budgets/balancing" icon={<Scale />} label="Balancing" />
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
              </>
            )}
          </SidebarMenu>
        </SidebarGroup>

        {!isMobile && (
          <>
            {/* On-budget accounts */}
            {onBudgetAccounts.length > 0 && (
              <SidebarAccountGroup
                label="Budget Accounts"
                accounts={onBudgetAccounts}
                budgetId={budgetId}
              />
            )}

            {trackingAccounts.length > 0 && (
              <SidebarAccountGroup
                label="Tracking Accounts"
                accounts={trackingAccounts}
                budgetId={budgetId}
              />
            )}

            {/* Closed accounts, collapsed: kept for their history, not in use */}
            {closedAccounts.length > 0 && (
              <SidebarAccountGroup
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
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="text-sidebar-foreground/70" onClick={onSignOut}>
              <LogOut />
              <span>Switch user</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

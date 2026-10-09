import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn, formatCurrency } from "@/lib/utils";

export type SidebarAccount = { id: number; name: string; balance: number };

/** One collapsible section of accounts, with what the section is worth. */
export function SidebarAccountGroup({
  label,
  accounts,
  budgetId,
  defaultOpen = true,
}: {
  label: string;
  accounts: SidebarAccount[];
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
        render={<button type="button" onClick={() => setOpen((o) => !o)} />}
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

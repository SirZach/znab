import { Link, type LinkProps } from "@tanstack/react-router";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

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
export function NavItem({
  icon,
  label,
  activeOptions,
  ...link
}: LinkProps & {
  icon: React.ReactNode;
  label: string;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        // Leaving the sheet open on a phone would cover the page just opened
        onClick={() => setOpenMobile(false)}
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

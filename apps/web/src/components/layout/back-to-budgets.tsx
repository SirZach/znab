import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

/** Back to the budget picker, one step short of Switch user. */
export function BackToBudgets() {
  const { setOpenMobile } = useSidebar();

  return (
    <Link
      to="/budgets"
      aria-label="All budgets"
      title="All budgets"
      onClick={() => setOpenMobile(false)}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <ChevronLeft className="size-4" />
    </Link>
  );
}

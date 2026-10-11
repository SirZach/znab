import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The panel beside a page's main content. Pass `className="w-96"` for a wider one. */
export function SidePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <aside className={cn("w-80 shrink-0 border-l border-border bg-card overflow-y-auto", className)}>
      {children}
    </aside>
  );
}

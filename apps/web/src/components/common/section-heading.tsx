import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The small uppercase heading over a panel section. */
export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h4
      className={cn(
        "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      {children}
    </h4>
  );
}

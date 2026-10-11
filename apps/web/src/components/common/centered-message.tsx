import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A muted line in the middle of a box: loading, or nothing to show. The
 * caller gives the height, `h-full` for a whole page.
 */
export function CenteredMessage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A small square button around an icon, for panel headers. Needs an `aria-label`. */
export function IconButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
        className
      )}
      {...props}
    />
  );
}

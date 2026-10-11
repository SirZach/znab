import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A bordered card that is a router link; the caller lays out its contents. */
export const LinkCard = createLink(function LinkCard({
  className,
  ...props
}: ComponentProps<"a">) {
  return (
    <a
      {...props}
      className={cn(
        "rounded-xl border border-border bg-card p-5 transition-all hover:border-primary hover:bg-accent",
        className
      )}
    />
  );
});

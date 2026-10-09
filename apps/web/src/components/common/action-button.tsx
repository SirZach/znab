import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The compact button the panels and forms use. It is not `ui/button`: that
 * one's base styles (height, weight, radius, focus ring) differ, and these
 * buttons look the way they do on purpose.
 */
export const actionButtonVariants = cva(
  "rounded py-1.5 text-sm disabled:opacity-50 transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-primary px-3 text-primary-foreground hover:bg-primary/90",
        outline:
          "border border-border px-2.5 text-muted-foreground hover:text-foreground hover:bg-accent",
        /** Turns red on hover, for a delete that confirms before it acts. */
        "outline-danger":
          "border border-border px-2.5 text-muted-foreground hover:text-destructive hover:bg-accent",
        destructive: "border border-destructive/50 px-3 text-destructive hover:bg-destructive/10",
      },
    },
    defaultVariants: { variant: "primary" },
  }
);

export function ActionButton({
  className,
  variant,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof actionButtonVariants>) {
  return (
    <button type={type} className={cn(actionButtonVariants({ variant }), className)} {...props} />
  );
}

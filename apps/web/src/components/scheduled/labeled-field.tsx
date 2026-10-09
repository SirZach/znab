import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A schedule form field with its small label above. A native control goes in a
 * `label`; a popover trigger goes in a `div`, since it labels itself.
 */
export function LabeledField({
  label,
  as: Tag = "label",
  className,
  children,
}: {
  label: string;
  as?: "label" | "div";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("block", className)}>
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      {children}
    </Tag>
  );
}

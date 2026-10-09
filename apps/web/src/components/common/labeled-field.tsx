import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A form control with its small muted label above it. A native control goes in
 * a `label`; a popover trigger goes in a `div`, since it labels itself.
 */
export function LabeledField({
  label,
  as: Tag = "label",
  className,
  children,
}: {
  label: ReactNode;
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

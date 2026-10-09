import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A form control with its small muted label above it. */
export function LabeledField({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children
    <label className={cn("block", className)}>
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

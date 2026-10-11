import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The three looks a row of mutually exclusive buttons takes in the app:
 * `primary` fills the panel width (the inspector's move direction), `subtle`
 * is the register's cleared filter, and `pill` is the report timeframe.
 */
const looks = {
  primary: {
    group: "flex rounded border border-border overflow-hidden",
    item: "flex-1 px-2 py-1.5 text-xs transition-colors",
    active: "bg-primary text-primary-foreground",
    idle: "text-muted-foreground hover:bg-accent",
  },
  subtle: {
    group: "inline-flex items-center rounded border border-border overflow-hidden",
    item: "px-2.5 py-1 text-xs border-r border-border last:border-r-0 transition-colors",
    active: "bg-accent text-foreground font-medium",
    idle: "text-muted-foreground hover:bg-accent/40",
  },
  pill: {
    group: "flex rounded-lg border border-border p-0.5",
    item: "rounded-md px-3 py-1.5 text-sm transition-colors",
    active: "bg-primary text-primary-foreground",
    idle: "text-muted-foreground hover:text-foreground",
  },
};

export type SegmentedOption<T extends string> = { value: T; label: ReactNode };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = "primary",
  className,
  "aria-label": ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: keyof typeof looks;
  className?: string;
  "aria-label"?: string;
}) {
  const look = looks[variant];
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled segmented toggle; a fieldset would bring its own border and layout
    <div className={cn(look.group, className)} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(look.item, option.value === value ? look.active : look.idle)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

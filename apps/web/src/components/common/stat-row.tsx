import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone = "good" | "warn" | "danger";

/** A label and its figure on one line of a `dl`. */
export function StatRow({
  label,
  value,
  emphasis,
  tone,
}: {
  label: ReactNode;
  value: string;
  emphasis?: boolean;
  tone?: StatTone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          emphasis ? "text-base font-semibold" : "text-sm",
          tone === "good" && "text-success",
          tone === "warn" && "text-warning",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

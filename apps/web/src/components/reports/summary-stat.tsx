import type { ReactNode } from "react";

/**
 * A headline figure over a report's chart. A `color` swatch or a `line` marks
 * which series it is; with neither it is a plain figure.
 */
export function SummaryStat({
  label,
  value,
  color,
  line,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  line?: boolean;
}) {
  const keyed = line || color !== undefined;
  return (
    <div>
      {keyed ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {line ? (
            <span className="inline-block h-0.5 w-4 bg-foreground" />
          ) : (
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
          )}
          {label}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">{label}</div>
      )}
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

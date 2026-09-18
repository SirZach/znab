import { CLEARED_VALUES, type ClearedValue } from "@znab/shared";
import { cn } from "@/lib/utils";

export type ClearedFilterValue = "all" | ClearedValue;

/** The choices in the order the register reads them: everything, then narrowing. */
const CHOICES: { value: ClearedFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  ...CLEARED_VALUES.map((value) => ({ value, label: value })),
];

/**
 * Which rows the register shows, by how far through the bank they have got.
 *
 * The counts matter more than the labels here. An account of 7,561 rows where
 * 7,528 are reconciled is one where the thirty-odd that are not are the only
 * ones anybody wants to look at, and the count is what says so before the
 * filter is applied. They are counted over the whole account rather than the
 * page, so they go on saying it while a filter is in force.
 */
export function ClearedFilter({
  value,
  counts,
  onChange,
}: {
  value: ClearedFilterValue;
  counts: Record<ClearedFilterValue, number>;
  onChange: (value: ClearedFilterValue) => void;
}) {
  return (
    <div className="inline-flex items-center rounded border border-border overflow-hidden">
      {CHOICES.map((choice) => {
        const active = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(choice.value)}
            className={cn(
              "px-2.5 py-1 text-xs border-r border-border last:border-r-0 transition-colors",
              active
                ? "bg-accent text-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/40"
            )}
          >
            {choice.label}
            <span className="ml-1.5 tabular-nums opacity-60">
              {counts[choice.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

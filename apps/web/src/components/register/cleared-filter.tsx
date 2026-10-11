import { CLEARED_VALUES, type ClearedValue } from "@znab/shared";
import { SegmentedControl } from "@/components/common/segmented-control";

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
    <SegmentedControl
      variant="subtle"
      options={CHOICES.map((choice) => ({
        value: choice.value,
        label: (
          <>
            {choice.label}
            <span className="ml-1.5 tabular-nums opacity-60">{counts[choice.value]}</span>
          </>
        ),
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

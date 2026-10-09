import { REPORT_TIMEFRAMES, type ReportTimeframe } from "@znab/shared";
import { SegmentedControl } from "@/components/common/segmented-control";

const LABELS: Record<ReportTimeframe, string> = {
  all: "All Dates",
  thisYear: "This Year",
  last12: "Last 12 Months",
  last4Years: "Last 4 Years",
};

const OPTIONS = REPORT_TIMEFRAMES.map((value) => ({ value, label: LABELS[value] }));

/** Which stretch of history a report covers. */
export function TimeframeToggle({
  value,
  onChange,
}: {
  value: ReportTimeframe;
  onChange: (value: ReportTimeframe) => void;
}) {
  return (
    <SegmentedControl
      variant="pill"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      aria-label="Timeframe"
    />
  );
}

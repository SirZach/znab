import type { ReactNode } from "react";
import type { ReportTimeframe } from "@znab/shared";
import { CenteredMessage } from "@/components/common/centered-message";
import { TimeframeToggle } from "@/components/reports/timeframe-toggle";

/**
 * The frame every report shares: title and timeframe, a row of headline
 * figures, and the chart card, which says so while loading or when there is
 * nothing to draw. `footer` sits under the card, for a table.
 */
export function ReportLayout({
  title,
  timeframe,
  onTimeframeChange,
  stats,
  isLoading,
  isEmpty,
  emptyMessage,
  messageClassName = "h-[28rem]",
  children,
  footer,
}: {
  title: string;
  timeframe: ReportTimeframe;
  onTimeframeChange: (timeframe: ReportTimeframe) => void;
  stats: ReactNode;
  isLoading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  /** The height of the loading and empty message, to match the chart's. */
  messageClassName?: string;
  /** The chart, drawn once loaded and not empty. */
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">{title}</h2>
        <TimeframeToggle value={timeframe} onChange={onTimeframeChange} />
      </div>

      <div className="flex flex-wrap gap-10">{stats}</div>

      <div className="rounded-xl border border-border bg-card p-4">
        {isLoading ? (
          <CenteredMessage className={messageClassName}>Loading…</CenteredMessage>
        ) : isEmpty ? (
          <CenteredMessage className={messageClassName}>{emptyMessage}</CenteredMessage>
        ) : (
          children
        )}
      </div>

      {footer}
    </div>
  );
}

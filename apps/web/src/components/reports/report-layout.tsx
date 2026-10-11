import type { ReactNode } from "react";
import { CenteredMessage } from "@/components/common/centered-message";

/**
 * The frame every report shares: title and filters, a row of headline
 * figures, and the chart card, which says so while loading or when there is
 * nothing to draw. `footer` sits under the card, for a table.
 */
export function ReportLayout({
  title,
  filters,
  stats,
  isLoading,
  isEmpty,
  emptyMessage,
  messageClassName = "h-[28rem]",
  children,
  footer,
}: {
  title: ReactNode;
  /** The report's `ReportFilters`. */
  filters: ReactNode;
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
        {filters}
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

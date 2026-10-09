import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CloseIconButton } from "@/components/common/close-icon-button";

/** A side panel's title, a line under it, and the button that closes it. */
export function SidePanelHeader({
  title,
  subtitle,
  onClose,
  closeLabel = "Close",
  closeTitle,
  titleClassName,
  subtitleClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  closeTitle?: string;
  /** Appended to the title, e.g. `truncate`. */
  titleClassName?: string;
  /** Appended to the subtitle, e.g. `tabular-nums`. */
  subtitleClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
      <div className="min-w-0">
        <h3 className={cn("font-semibold", titleClassName)}>{title}</h3>
        {subtitle !== undefined && (
          <p className={cn("text-xs text-muted-foreground", subtitleClassName)}>{subtitle}</p>
        )}
      </div>
      <CloseIconButton onClick={onClose} label={closeLabel} title={closeTitle} />
    </div>
  );
}

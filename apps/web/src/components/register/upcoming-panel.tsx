import { useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canSkip,
  frequencyLabel,
  upcomingRows,
  type UpcomingOccurrence,
} from "@/lib/schedule";
import { cn, formatCurrency, formatDateShort } from "@/lib/utils";

/**
 * What this account has due and coming up, above its register the way YNAB 4
 * puts it there. Nothing due and nothing coming up is no band at all: the
 * register is the point of the screen.
 */
export function UpcomingPanel({
  occurrences,
  onEnter,
  onSkip,
  isBusy,
  error,
}: {
  occurrences: readonly UpcomingOccurrence[];
  onEnter: (scheduledTransactionId: number) => void;
  onSkip: (scheduledTransactionId: number) => void;
  isBusy: boolean;
  error: string | null;
}) {
  // Null until the reader says otherwise, so the band can open itself on
  // something due without an effect to re-decide once the query arrives.
  const [opened, setOpened] = useState<boolean | null>(null);

  const rows = upcomingRows(occurrences);
  if (rows.length === 0) return null;

  const dueCount = rows.filter((r) => r.due).length;
  const open = opened ?? dueCount > 0;

  return (
    <div className="px-6 py-2 border-b border-border bg-accent/20">
      <button
        onClick={() => setOpened(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>
          {/* Schedules, not occurrences: one overdue schedule is one row here
              however many times it has come round, and the row says so. */}
          {dueCount > 0 && (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {dueCount} {dueCount === 1 ? "schedule" : "schedules"} due
            </span>
          )}
          {dueCount > 0 && rows.length > dueCount && ", "}
          {rows.length > dueCount && `${rows.length - dueCount} upcoming`}
        </span>
      </button>

      {open && (
        <ul className="mt-1.5">
          {rows.map((row) => (
            <li
              key={`${row.scheduledTransactionId}-${row.date}`}
              className={cn(
                "flex items-center gap-3 py-1 text-xs",
                row.due ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span className="w-9 shrink-0">
                {row.due && (
                  <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Due
                  </span>
                )}
              </span>
              <span className="w-24 shrink-0 tabular-nums">{formatDateShort(row.date)}</span>
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                {row.isTransfer && (
                  <ArrowLeftRight
                    size={12}
                    className="shrink-0 opacity-60"
                    aria-label="Transfer"
                  />
                )}
                <span className="truncate">{row.payeeName ?? "No payee"}</span>
              </span>
              <span className="flex-1 min-w-0 truncate">
                {row.categoryName ?? "No category"}
              </span>
              <span className="w-24 shrink-0 text-right tabular-nums">
                {formatCurrency(row.amount)}
              </span>
              <span className="w-28 shrink-0 text-right">
                <span className="block">{frequencyLabel(row.frequency)}</span>
                {row.behind && (
                  <span className="block text-amber-600 dark:text-amber-400">{row.behind}</span>
                )}
              </span>
              <span className="w-28 shrink-0 flex justify-end gap-1">
                {row.enterable && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={isBusy}
                      onClick={() => onEnter(row.scheduledTransactionId)}
                    >
                      Enter
                    </Button>
                    {canSkip(row.frequency) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={isBusy}
                        onClick={() => onSkip(row.scheduledTransactionId)}
                      >
                        Skip
                      </Button>
                    )}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

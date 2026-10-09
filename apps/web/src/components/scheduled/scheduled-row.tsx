import { ArrowLeftRight } from "lucide-react";
import type { ScheduledTransaction } from "@/hooks/useScheduledTransactions";
import { behindLabel, canSkip, frequencyLabel } from "@/lib/schedule";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

const actionClass =
  "rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors";

/** One schedule in the manage list, with its actions at the end. */
export function ScheduledRow({
  row,
  selected,
  isEntering,
  isSkipping,
  onEnter,
  onSkip,
  onEdit,
  onDelete,
}: {
  row: ScheduledTransaction;
  selected: boolean;
  isEntering: boolean;
  isSkipping: boolean;
  onEnter: () => void;
  onSkip: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const behind = behindLabel(row.dueCount);
  return (
    <tr
      aria-selected={selected}
      className={cn("border-b border-border/50", selected ? "bg-accent/60" : row.isDue && "bg-primary/5")}
    >
      <td className="px-6 py-2 whitespace-nowrap">
        {formatDate(row.date)}
        {row.isDue && (
          <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">due</span>
        )}
        {behind && <span className="block text-xs text-muted-foreground">{behind}</span>}
      </td>

      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
        {frequencyLabel(row.frequency)}
      </td>

      <td className="px-3 py-2">
        {row.payee?.name ?? <span className="text-muted-foreground">—</span>}
        {row.isTransfer && (
          <span
            title="Entering this moves money between two accounts, so both sides are written."
            className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground"
          >
            <ArrowLeftRight size={11} />
            transfer
          </span>
        )}
      </td>

      <td className="px-3 py-2 text-muted-foreground">{row.category?.name ?? "—"}</td>

      <td className="px-3 py-2 text-muted-foreground">{row.account.name}</td>

      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
        {formatCurrency(row.amount)}
      </td>

      <td className="px-3 py-2 text-muted-foreground truncate max-w-48">{row.memo}</td>

      <td className="px-6 py-2 text-right whitespace-nowrap">
        <button type="button" disabled={isEntering} onClick={onEnter} className={actionClass}>
          Enter
        </button>
        {/* A schedule that happens once has nothing to skip to, and the API
            refuses it, so it is not offered. */}
        {canSkip(row.frequency) && (
          <button type="button" disabled={isSkipping} onClick={onSkip} className={actionClass}>
            Skip
          </button>
        )}
        <button type="button" onClick={onEdit} className={actionClass}>
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={cn(actionClass, "hover:bg-destructive/10 hover:text-destructive")}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

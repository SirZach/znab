import type { ScheduledTransaction } from "@/hooks/useScheduledTransactions";
import { ScheduledRow } from "@/components/scheduled/scheduled-row";

/** Every schedule in the budget, or a line saying there are none yet. */
export function ScheduledTable({
  scheduled,
  editingId,
  isEntering,
  isSkipping,
  onEnter,
  onSkip,
  onEdit,
  onDelete,
}: {
  scheduled: ScheduledTransaction[];
  editingId: number | null;
  isEntering: boolean;
  isSkipping: boolean;
  onEnter: (id: number) => void;
  onSkip: (id: number) => void;
  onEdit: (row: ScheduledTransaction) => void;
  onDelete: (row: ScheduledTransaction) => void;
}) {
  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-muted-foreground">
            <th className="text-left px-6 py-2 font-semibold">Next</th>
            <th className="text-left px-3 py-2 font-semibold">Frequency</th>
            <th className="text-left px-3 py-2 font-semibold">Payee</th>
            <th className="text-left px-3 py-2 font-semibold">Category</th>
            <th className="text-left px-3 py-2 font-semibold">Account</th>
            <th className="text-right px-3 py-2 font-semibold">Amount</th>
            <th className="text-left px-3 py-2 font-semibold">Memo</th>
            <th className="px-6 py-2" />
          </tr>
        </thead>
        <tbody>
          {scheduled.map((row) => (
            <ScheduledRow
              key={row.id}
              row={row}
              selected={row.id === editingId}
              isEntering={isEntering}
              isSkipping={isSkipping}
              onEnter={() => onEnter(row.id)}
              onSkip={() => onSkip(row.id)}
              onEdit={() => onEdit(row)}
              onDelete={() => onDelete(row)}
            />
          ))}
        </tbody>
      </table>

      {scheduled.length === 0 && (
        <p className="px-6 py-8 text-center text-muted-foreground">
          Nothing is scheduled yet. Add the first one above.
        </p>
      )}
    </>
  );
}

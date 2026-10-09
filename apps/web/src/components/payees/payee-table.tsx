import { PayeeRow } from "@/components/payees/payee-row";
import type { ManagedPayee } from "@/hooks/usePayees";

/**
 * The payees drawn so far, with a line when nothing matches and a button for
 * the rows not yet drawn.
 */
export function PayeeTable({
  visible,
  matchCount,
  totalCount,
  search,
  inspectedId,
  checkedIds,
  editingId,
  onInspect,
  onToggleChecked,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onShowMore,
}: {
  visible: ManagedPayee[];
  /** How many payees match the search, drawn or not. */
  matchCount: number;
  totalCount: number;
  search: string;
  inspectedId: number | null;
  checkedIds: ReadonlySet<number>;
  editingId: number | null;
  onInspect: (id: number) => void;
  onToggleChecked: (id: number) => void;
  onStartRename: (id: number) => void;
  onCommitRename: (payee: ManagedPayee, name: string) => void;
  onCancelRename: () => void;
  onShowMore: () => void;
}) {
  return (
    <>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b border-border z-10">
          <tr className="text-muted-foreground">
            <th className="w-10 px-6 py-2" />
            <th className="text-left px-2 py-2 font-medium">Payee</th>
            <th className="w-16 px-2 py-2" />
            <th className="text-right px-4 py-2 font-medium w-32">Transactions</th>
            <th className="text-right px-6 py-2 font-medium w-40">Last used</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((payee) => (
            <PayeeRow
              key={payee.id}
              payee={payee}
              inspected={payee.id === inspectedId}
              checked={checkedIds.has(payee.id)}
              editing={payee.id === editingId}
              onInspect={() => onInspect(payee.id)}
              onToggleChecked={() => onToggleChecked(payee.id)}
              onStartRename={() => onStartRename(payee.id)}
              onCommitRename={(name) => onCommitRename(payee, name)}
              onCancelRename={onCancelRename}
            />
          ))}
        </tbody>
      </table>

      {matchCount === 0 && (
        <p className="px-6 py-8 text-center text-muted-foreground">
          {totalCount === 0
            ? "No payees yet. They are created as you enter transactions."
            : `No payees match "${search.trim()}".`}
        </p>
      )}

      {matchCount > visible.length && (
        <div className="px-6 py-4 text-center">
          <button
            type="button"
            onClick={onShowMore}
            className="rounded border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-accent transition-colors"
          >
            Show more ({matchCount - visible.length} remaining)
          </button>
        </div>
      )}
    </>
  );
}

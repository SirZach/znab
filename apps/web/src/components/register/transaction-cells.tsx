import type { FlagColor } from "@znab/shared";
import { ClearedCell } from "@/components/register/cleared-cell";
import { FlagCell } from "@/components/register/flag-cell";
import type { RegisterTransaction } from "@/hooks/useRegisterPages";
import { flagColorOf } from "@/lib/register-edit";
import { formatCurrency, formatDateShort } from "@/lib/utils";

/** A row being read rather than edited: its cells, with the flag and C live. */
export function TransactionCells({
  txn,
  onFlag,
  onCycleCleared,
}: {
  txn: RegisterTransaction;
  onFlag: (flagColor: FlagColor | null) => void;
  onCycleCleared: () => void;
}) {
  const amount = parseFloat(txn.amount);
  const isInflow = amount > 0;

  return (
    <>
      <FlagCell value={flagColorOf(txn.flagColor)} onSelect={onFlag} />
      <td className="px-6 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
        {formatDateShort(txn.date)}
      </td>
      <td className="px-4 py-2 truncate" title={txn.payee?.name ?? undefined}>
        {txn.payee?.name ?? "—"}
      </td>
      <td className="px-4 py-2 text-muted-foreground truncate">
        {txn.isSplit
          ? "Split"
          : txn.category?.name ?? txn.categoryYnabId?.split("/").pop() ?? "—"}
      </td>
      {/* The whole memo on hover, since this is the column most likely to be
          cut and the least costly to cut. */}
      <td className="px-4 py-2 text-muted-foreground truncate" title={txn.memo ?? undefined}>
        {txn.memo ?? ""}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {!isInflow ? formatCurrency(Math.abs(amount)) : ""}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-green-500">
        {isInflow ? formatCurrency(amount) : ""}
      </td>
      <ClearedCell cleared={txn.cleared} onCycle={onCycleCleared} />
      <td className="px-6 py-2 text-right tabular-nums font-medium">
        {formatCurrency(txn.runningBalance)}
      </td>
    </>
  );
}

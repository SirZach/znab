import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ClearedCell } from "@/components/register/cleared-cell";
import { RegisterRowFields, type RegisterRowLocks } from "@/components/register/row-fields";
import type { RegisterLookups } from "@/hooks/useRegisterLookups";
import type { RegisterTransaction } from "@/hooks/useRegisterPages";
import { fieldsFrom } from "@/lib/register-edit";
import type { RegisterFields } from "@/lib/register-row";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * A transaction already on the books, in place: the same controls the add row
 * uses, over a draft of its own. Enter commits and Escape reverts, both from
 * anywhere in the row; clicking another row drops the draft the same way. Key
 * it on the row, so the draft is seeded from whichever row is being edited.
 */
export function EditCells({
  txn,
  locks,
  payeeList,
  categoryOptions,
  autofillForPayee,
  isBusy,
  onSave,
  onDelete,
  onCancel,
  onCycleCleared,
}: {
  txn: RegisterTransaction;
  locks: RegisterRowLocks;
  payeeList: RegisterLookups["payeeList"];
  categoryOptions: RegisterLookups["categoryOptions"];
  autofillForPayee: RegisterLookups["autofillForPayee"];
  isBusy: boolean;
  onSave: (fields: RegisterFields) => void;
  onDelete: () => void;
  onCancel: () => void;
  onCycleCleared: () => void;
}) {
  const [fields, setFields] = useState<RegisterFields>(() => fieldsFrom(txn));
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <RegisterRowFields
        fields={fields}
        onChange={(patch) => setFields((prev) => ({ ...prev, ...patch }))}
        payees={payeeList}
        categoryOptions={categoryOptions}
        autofill={autofillForPayee}
        locks={locks}
        onSubmit={() => onSave(fields)}
        onCancel={onCancel}
        autoFocus
      />

      <ClearedCell cleared={txn.cleared} onCycle={onCycleCleared} />

      <td className="px-6 py-2 text-right">
        <span className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onSave(fields)}
            disabled={isBusy}
            aria-label="Save changes"
            title="Save changes"
            className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={isBusy}
            aria-label="Delete transaction"
            title="Delete transaction"
            className="text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </span>

        {/* Nothing else in this app confirms before it destroys, but a deleted
            transaction cannot be brought back from here, and deleting one side
            of a transfer takes the other account's row with it. */}
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Delete this transaction?"
          description={
            <>
              {formatDate(txn.date)}, {txn.payee?.name ?? "no payee"},{" "}
              {formatCurrency(txn.amount)}.
              {txn.isTransfer
                ? " This is a transfer, so the matching transaction in the other account goes too."
                : ""}{" "}
              This cannot be undone here.
            </>
          }
          confirmLabel="Delete"
          onConfirm={onDelete}
        />
      </td>
    </>
  );
}

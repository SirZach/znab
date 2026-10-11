import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { formatDate } from "@/lib/utils";

/**
 * Asked before a reconciled row opens for editing. A transfer can be reconciled
 * on its far side alone, since each account is reconciled against its own
 * statement. Calling that "this transaction is reconciled" would be untrue, and
 * it is the other account's statement that would be put out of step, so
 * `ownSide` picks the wording.
 */
export function ReconciledWarningDialog({
  open,
  onOpenChange,
  ownSide,
  lastReconciledDate,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether this row is the reconciled one, rather than its far side. */
  ownSide: boolean;
  lastReconciledDate: string | null | undefined;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="default"
      title={
        ownSide
          ? "This transaction is reconciled"
          : "The other side of this transfer is reconciled"
      }
      description={
        ownSide ? (
          <>
            Changing it will put this account out of step with the statement it was reconciled
            against
            {lastReconciledDate ? ` on ${formatDate(lastReconciledDate)}` : ""}.
          </>
        ) : (
          "This row is not, but the matching one in the other account is, and a transfer's two halves move together. Changing it will put that account out of step with the statement it was reconciled against."
        )
      }
      confirmLabel="Edit anyway"
      onConfirm={onConfirm}
    />
  );
}

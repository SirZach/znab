import { ActionButton } from "@/components/common/action-button";
import { SidePanelSection } from "@/components/common/side-panel-section";
import type { ManagedPayee } from "@/hooks/usePayees";

/**
 * Deleting a payee, offered only when nothing points at it. A transfer payee
 * goes with its account, and a used one is merged instead.
 */
export function PayeeRemovalSection({
  payee,
  error,
  onDelete,
}: {
  payee: ManagedPayee;
  error: string | null;
  onDelete: (id: number) => void;
}) {
  return (
    <SidePanelSection bordered={false}>
      {payee.targetAccountId !== null ? (
        <p className="text-xs text-muted-foreground">Delete the account to remove this payee.</p>
      ) : payee.transactionCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          Used by {payee.transactionCount} transactions, so it cannot be deleted. Select it along
          with another payee to merge them, which keeps the history.
        </p>
      ) : (
        <ActionButton variant="destructive" onClick={() => onDelete(payee.id)} className="w-full">
          Delete payee
        </ActionButton>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </SidePanelSection>
  );
}

import { Lock } from "lucide-react";
import { SidePanel } from "@/components/common/side-panel";
import { SidePanelHeader } from "@/components/common/side-panel-header";
import { AutofillSection } from "@/components/payees/autofill-section";
import { PayeeRemovalSection } from "@/components/payees/payee-removal-section";
import { RenameRulesSection } from "@/components/payees/rename-rules-section";
import type { AddRenameRule, AutofillInput, ManagedPayee } from "@/hooks/usePayees";
import type { CategoryOption } from "@/lib/category-options";
import { TRANSFER_NOTE } from "@/lib/payees";
import { formatDate } from "@/lib/utils";

/** The side panel for one payee. Its drafts are seeded once, so remount it per payee. */
export function PayeeInspector({
  payee,
  categoryOptions,
  isSavingAutofill,
  isAddingRule,
  autofillError,
  ruleError,
  onSetAutofill,
  onAddRule,
  onDeleteRule,
  onDelete,
  deleteError,
  onClose,
}: {
  payee: ManagedPayee;
  categoryOptions: CategoryOption[];
  isSavingAutofill: boolean;
  isAddingRule: boolean;
  autofillError: string | null;
  ruleError: string | null;
  onSetAutofill: (input: AutofillInput) => void;
  onAddRule: AddRenameRule;
  onDeleteRule: (id: number) => void;
  onDelete: (id: number) => void;
  deleteError: string | null;
  onClose: () => void;
}) {
  return (
    <SidePanel>
      <SidePanelHeader
        title={payee.name}
        titleClassName="truncate"
        subtitle={
          <>
            {payee.transactionCount} transactions
            {payee.lastUsed ? `, last used ${formatDate(payee.lastUsed)}` : ""}
          </>
        }
        onClose={onClose}
      />

      {payee.targetAccountId !== null && (
        <p className="flex gap-2 px-4 py-3 border-b border-border text-xs text-muted-foreground">
          <Lock size={13} className="shrink-0 mt-0.5" />
          {TRANSFER_NOTE}
        </p>
      )}

      <AutofillSection
        payee={payee}
        categoryOptions={categoryOptions}
        isSaving={isSavingAutofill}
        error={autofillError}
        onSave={onSetAutofill}
      />

      <RenameRulesSection
        payee={payee}
        isAdding={isAddingRule}
        error={ruleError}
        onAdd={onAddRule}
        onDelete={onDeleteRule}
      />

      <PayeeRemovalSection payee={payee} error={deleteError} onDelete={onDelete} />
    </SidePanel>
  );
}

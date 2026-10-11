import { useState } from "react";
import { ActionButton } from "@/components/common/action-button";
import { FieldInput } from "@/components/common/field-input";
import { FieldSelect } from "@/components/common/field-select";
import { SectionHeading } from "@/components/common/section-heading";
import { SidePanelSection } from "@/components/common/side-panel-section";
import type { AutofillInput, ManagedPayee } from "@/hooks/usePayees";
import type { CategoryOption } from "@/lib/category-options";
import { autofillDraft } from "@/lib/payees";

/**
 * A payee's autofill defaults. Its drafts are seeded once, so the caller
 * remounts it per payee.
 */
export function AutofillSection({
  payee,
  categoryOptions,
  isSaving,
  error,
  onSave,
}: {
  payee: ManagedPayee;
  categoryOptions: CategoryOption[];
  isSaving: boolean;
  error: string | null;
  onSave: (input: AutofillInput) => void;
}) {
  const [initial] = useState(() => autofillDraft(payee, categoryOptions));
  const [categoryId, setCategoryId] = useState<number | "">(initial.categoryId);
  const [memo, setMemo] = useState(initial.memo);

  return (
    <SidePanelSection className="space-y-2">
      <SectionHeading>Autofill</SectionHeading>
      <p className="text-xs text-muted-foreground">
        Filled in automatically when this payee is chosen on a new transaction.
      </p>

      <FieldSelect
        aria-label="Autofill category"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full"
      >
        <option value="">No category</option>
        {categoryOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </FieldSelect>

      {autofillDraft(payee, categoryOptions).savedCategoryHidden && categoryId === "" && (
        <p className="text-xs text-muted-foreground">
          This payee&apos;s saved category is hidden, so saving clears it.
        </p>
      )}

      <FieldInput
        type="text"
        aria-label="Autofill memo"
        placeholder="Memo"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        className="w-full"
      />

      <ActionButton
        disabled={isSaving}
        onClick={() =>
          onSave({
            id: payee.id,
            categoryId: categoryId === "" ? null : categoryId,
            memo: memo.trim() || null,
          })
        }
        className="w-full"
      >
        {isSaving ? "Saving…" : "Save autofill"}
      </ActionButton>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </SidePanelSection>
  );
}

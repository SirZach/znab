import { useState } from "react";
import { X } from "lucide-react";
import { PAYEE_RENAME_OPERATORS, type PayeeRenameOperator } from "@znab/shared";
import { FieldInput } from "@/components/common/field-input";
import { FieldSelect } from "@/components/common/field-select";
import { SectionHeading } from "@/components/common/section-heading";
import { SidePanelSection } from "@/components/common/side-panel-section";
import type { AddRenameRule, ManagedPayee } from "@/hooks/usePayees";
import { OPERATOR_LABELS } from "@/lib/payees";

/** A payee's rename rules, and the form that adds one. */
export function RenameRulesSection({
  payee,
  isAdding,
  error,
  onAdd,
  onDelete,
}: {
  payee: ManagedPayee;
  isAdding: boolean;
  error: string | null;
  onAdd: AddRenameRule;
  onDelete: (id: number) => void;
}) {
  const [operator, setOperator] = useState<PayeeRenameOperator>("Contains");
  const [operand, setOperand] = useState("");

  return (
    <SidePanelSection className="space-y-2">
      <SectionHeading>Rename rules</SectionHeading>
      <p className="text-xs text-muted-foreground">
        Maps a name from an imported bank file onto this payee. Importing bank files is not built
        yet, so rules are stored but nothing reads them.
      </p>

      {payee.renameRules.length === 0 ? (
        <p className="text-xs text-muted-foreground">No rules.</p>
      ) : (
        <ul className="space-y-1">
          {payee.renameRules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm"
            >
              <span className="text-xs text-muted-foreground shrink-0">
                {OPERATOR_LABELS[rule.operator]}
              </span>
              <span className="truncate">{rule.operand}</span>
              <button
                type="button"
                onClick={() => onDelete(rule.id)}
                aria-label={`Remove rule ${rule.operand}`}
                className="ml-auto p-0.5 rounded text-muted-foreground hover:text-destructive"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <FieldSelect
          aria-label="Rule operator"
          value={operator}
          onChange={(e) => setOperator(e.target.value as PayeeRenameOperator)}
          className="shrink-0"
        >
          {PAYEE_RENAME_OPERATORS.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </FieldSelect>
        <FieldInput
          type="text"
          aria-label="Rule text"
          placeholder="Bank text"
          value={operand}
          onChange={(e) => setOperand(e.target.value)}
          className="min-w-0 flex-1"
        />
      </div>

      <button
        type="button"
        disabled={!operand.trim() || isAdding}
        onClick={() => onAdd(payee.id, operator, operand.trim(), () => setOperand(""))}
        className="w-full rounded border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-accent disabled:opacity-50 transition-colors"
      >
        {isAdding ? "Adding…" : "Add rule"}
      </button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </SidePanelSection>
  );
}

import type { Ref } from "react";
import { ActionButton } from "@/components/common/action-button";
import { RegisterColgroup } from "@/components/register/register-colgroup";
import { RowError } from "@/components/register/row-error";
import { RegisterRowFields, type RegisterRowLocks } from "@/components/register/row-fields";
import type { RegisterLookups } from "@/hooks/useRegisterLookups";
import type { RegisterFields } from "@/lib/register-row";

/** The sticky row under the register that enters a new transaction. */
export function AddRow({
  fields,
  onChange,
  payeeList,
  categoryOptions,
  autofillForPayee,
  locks,
  onSave,
  onCancel,
  isSaving,
  error,
  dateInputRef,
}: {
  fields: RegisterFields;
  onChange: (patch: Partial<RegisterFields>) => void;
  payeeList: RegisterLookups["payeeList"];
  categoryOptions: RegisterLookups["categoryOptions"];
  autofillForPayee: RegisterLookups["autofillForPayee"];
  locks: RegisterRowLocks;
  onSave: () => void;
  /** Throws the half-entered row away and starts it over. */
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
  dateInputRef: Ref<HTMLInputElement>;
}) {
  return (
    // Lighter than any state a register row can be in, hovered, selected or
    // being edited, so where a new transaction goes is never mistaken for one.
    <table className="w-full table-fixed text-sm border-t-2 border-primary/60 bg-slate-700">
      <RegisterColgroup />
      <tbody>
        <tr>
          <RegisterRowFields
            fields={fields}
            onChange={onChange}
            payees={payeeList}
            categoryOptions={categoryOptions}
            autofill={autofillForPayee}
            locks={locks}
            onSubmit={onSave}
            tabIndexBase={1}
            dateInputRef={dateInputRef}
          />
          {/* Spans the cleared column too, so both buttons fit on one line. */}
          <td colSpan={2} className="px-2 py-2">
            <div className="flex justify-end gap-1.5 whitespace-nowrap">
              <ActionButton
                variant="outline"
                className="text-xs px-2 py-1"
                onClick={onCancel}
                disabled={isSaving}
              >
                Cancel
              </ActionButton>
              <ActionButton className="text-xs px-2 py-1" onClick={onSave} disabled={isSaving}>
                Save
              </ActionButton>
            </div>
          </td>
        </tr>

        {error && <RowError message={error} />}
      </tbody>
    </table>
  );
}

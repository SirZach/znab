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
  isSaving,
  error,
  payeeTriggerRef,
}: {
  fields: RegisterFields;
  onChange: (patch: Partial<RegisterFields>) => void;
  payeeList: RegisterLookups["payeeList"];
  categoryOptions: RegisterLookups["categoryOptions"];
  autofillForPayee: RegisterLookups["autofillForPayee"];
  locks: RegisterRowLocks;
  onSave: () => void;
  isSaving: boolean;
  error: string | null;
  payeeTriggerRef: Ref<HTMLButtonElement>;
}) {
  return (
    <table className="w-full table-fixed text-sm border-t border-border bg-accent/20">
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
            payeeTriggerRef={payeeTriggerRef}
          />
          <td className="px-2 py-2" />
          <td className="px-6 py-2 text-right">
            <ActionButton className="text-xs px-2 py-1" onClick={onSave} disabled={isSaving}>
              Save
            </ActionButton>
          </td>
        </tr>

        {error && <RowError message={error} />}
      </tbody>
    </table>
  );
}

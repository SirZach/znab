import { useState } from "react";
import type { AccountType } from "@znab/shared";
import { ActionButton } from "@/components/common/action-button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FieldInput } from "@/components/common/field-input";
import { FieldSelect } from "@/components/common/field-select";
import { SectionHeading } from "@/components/common/section-heading";
import { SidePanel } from "@/components/common/side-panel";
import { SidePanelHeader } from "@/components/common/side-panel-header";
import { SidePanelSection } from "@/components/common/side-panel-section";
import { LabeledField } from "@/components/accounts/labeled-field";
import type { ManagedAccount } from "@/hooks/useAccounts";
import {
  type AccountPatch,
  accountPatch,
  accountTypeLabel,
  accountTypeOptions,
  TRACKING_NOTE,
} from "@/lib/accounts";
import { trpc } from "@/trpc";

/** The side panel for one account. Remount it per account to reset the drafts. */
export function AccountInspector({
  budgetId,
  account,
  isSaving,
  updateError,
  hiddenError,
  deleteError,
  onUpdate,
  onSetHidden,
  onDelete,
  onClose,
}: {
  budgetId: number;
  account: ManagedAccount;
  isSaving: boolean;
  updateError: string | null;
  hiddenError: string | null;
  deleteError: string | null;
  onUpdate: (accountId: number, patch: AccountPatch) => void;
  onSetHidden: (accountId: number, hidden: boolean) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  // What this account may still be changed to hinges on whether it has any
  // transactions, and the account row does not carry that, so it is counted off
  // the register. One row is enough: the totals come back whatever the page
  // size. Until it arrives the answer is unknown, and the panel offers only
  // what is safe either way rather than an action the API would refuse.
  const { data: register } = trpc.account.transactions.useQuery({
    budgetId,
    accountId: account.id,
    limit: 1,
  });
  const used = register?.total ?? null;
  const empty = used === 0;

  // The column is plain text, so the stored type widens to a string on its way
  // out. The picker only ever writes one of ACCOUNT_TYPES back.
  const [accountType, setAccountType] = useState(account.accountType as AccountType);
  const [onBudget, setOnBudget] = useState(account.onBudget);
  const [note, setNote] = useState(account.note ?? "");
  const [confirming, setConfirming] = useState(false);

  const typeOptions = accountTypeOptions(account.accountType, used);
  const { patch, dirty } = accountPatch(account, { accountType, onBudget, note });

  return (
    <SidePanel>
      <SidePanelHeader
        title={account.name}
        titleClassName="truncate"
        subtitle={
          <>
            {accountTypeLabel(account.accountType)},{" "}
            {account.onBudget ? "budgeted" : "tracking"}
            {account.hidden ? ", closed" : ""}
            {used === null ? "" : `, ${used} transactions`}
          </>
        }
        onClose={onClose}
      />

      <SidePanelSection className="space-y-2">
        <SectionHeading>Details</SectionHeading>

        <LabeledField label="Type">
          <FieldSelect
            aria-label="Account type"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
            className="w-full"
          >
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {accountTypeLabel(t)}
              </option>
            ))}
          </FieldSelect>
        </LabeledField>

        <LabeledField label="Budgeting">
          <FieldSelect
            aria-label="Budgeting"
            disabled={!empty}
            value={onBudget ? "budget" : "tracking"}
            onChange={(e) => setOnBudget(e.target.value === "budget")}
            className="w-full disabled:opacity-50"
          >
            <option value="budget">Budget account</option>
            <option value="tracking">Tracking account</option>
          </FieldSelect>
        </LabeledField>

        {used !== null && (
          <p className="text-xs text-muted-foreground">
            {empty
              ? TRACKING_NOTE
              : "An account with transactions keeps the kind of money it holds: its history is already budgeted, or already not."}
          </p>
        )}

        <FieldInput
          type="text"
          aria-label="Note"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full"
        />

        <ActionButton
          disabled={!dirty || isSaving}
          onClick={() => onUpdate(account.id, patch)}
          className="w-full"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </ActionButton>

        {updateError && <p className="text-xs text-destructive">{updateError}</p>}
      </SidePanelSection>

      <SidePanelSection className="space-y-2">
        <SectionHeading>{account.hidden ? "Reopening" : "Closing"}</SectionHeading>
        <p className="text-xs text-muted-foreground">
          {account.hidden
            ? "Reopening puts this account back in the sidebar and lets it take transactions again."
            : "Closing takes a paid-off or emptied account out of the way. Its history stays, and it can be reopened."}
        </p>
        <button
          type="button"
          onClick={() => onSetHidden(account.id, !account.hidden)}
          className="w-full rounded border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-accent transition-colors"
        >
          {account.hidden ? "Reopen account" : "Close account"}
        </button>
        {hiddenError && <p className="text-xs text-destructive">{hiddenError}</p>}
      </SidePanelSection>

      <SidePanelSection bordered={false}>
        {used !== null &&
          (empty ? (
            <ActionButton
              variant="destructive"
              onClick={() => setConfirming(true)}
              className="w-full"
            >
              Delete account
            </ActionButton>
          ) : (
            <p className="text-xs text-muted-foreground">
              Used by {used} transactions, so it cannot be deleted. Close it instead, which keeps
              the history.
            </p>
          ))}
        {deleteError && <p className="mt-2 text-xs text-destructive">{deleteError}</p>}

        {/* Closing an account can be undone from here; deleting one cannot. */}
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Delete this account?"
          description={`"${account.name}" has no transactions, so no history is lost, but it cannot be brought back from here.`}
          confirmLabel="Delete"
          onConfirm={() => onDelete(account.id)}
        />
      </SidePanelSection>
    </SidePanel>
  );
}

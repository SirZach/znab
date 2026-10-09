import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AccountInspector } from "@/components/accounts/account-inspector";
import { AccountTable } from "@/components/accounts/account-table";
import { NewAccountForm } from "@/components/accounts/new-account-form";
import { CenteredMessage } from "@/components/common/centered-message";
import { ErrorList } from "@/components/common/error-list";
import { PageHeader } from "@/components/common/page-header";
import { useAccounts } from "@/hooks/useAccounts";

export const Route = createFileRoute("/budgets/$budgetId/accounts/")({
  component: AccountsPage,
});

function AccountsPage() {
  const { budgetId } = Route.useParams();
  const [inspectedId, setInspectedId] = useState<number | null>(null);

  const {
    accounts,
    isLoading,
    create,
    rename,
    update,
    setHidden,
    reorder,
    remove,
    isCreating,
    isSaving,
    isReordering,
    createError,
    renameError,
    updateError,
    hiddenError,
    reorderError,
    deleteError,
    resetStatus,
  } = useAccounts({ budgetId: Number(budgetId) });

  const closedCount = accounts.filter((a) => a.hidden).length;

  // The open panel is resolved against the live list each render, so an account
  // that has just been deleted drops out of it by itself.
  const inspected = accounts.find((a) => a.id === inspectedId);

  // A mutation error names the account it was made against, and the hook keeps
  // it past the remount that clears the panel's own drafts, so changing subject
  // has to drop it explicitly.
  function inspect(id: number | null) {
    resetStatus();
    setInspectedId(id);
  }

  if (isLoading) {
    return <CenteredMessage className="h-full">Loading accounts…</CenteredMessage>;
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Accounts"
        subtitle={
          <>
            {accounts.length - closedCount} open
            {closedCount > 0 ? `, ${closedCount} closed` : ""}
          </>
        }
      />

      <NewAccountForm onCreate={create} isCreating={isCreating} error={createError} />

      <ErrorList messages={[renameError, reorderError]} />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto">
          <AccountTable
            accounts={accounts}
            inspectedId={inspectedId}
            onInspect={inspect}
            isReordering={isReordering}
            onReorder={reorder}
            onRename={rename}
          />

          {accounts.length === 0 && (
            <p className="px-6 py-8 text-center text-muted-foreground">
              No accounts yet. Add the first one above.
            </p>
          )}
        </div>

        {inspected && (
          <AccountInspector
            // Remounting per account is what resets the draft fields.
            key={inspected.id}
            budgetId={Number(budgetId)}
            account={inspected}
            isSaving={isSaving}
            updateError={updateError}
            hiddenError={hiddenError}
            deleteError={deleteError}
            onUpdate={update}
            onSetHidden={setHidden}
            onDelete={remove}
            onClose={() => inspect(null)}
          />
        )}
      </div>
    </div>
  );
}

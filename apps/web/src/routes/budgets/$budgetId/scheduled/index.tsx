import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CenteredMessage } from "@/components/common/centered-message";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorList } from "@/components/common/error-list";
import { PageHeader } from "@/components/common/page-header";
import { DueBanner } from "@/components/scheduled/due-banner";
import { EnterDueSummary } from "@/components/scheduled/enter-due-summary";
import { ScheduleEditPanel } from "@/components/scheduled/schedule-edit-panel";
import { ScheduleForm } from "@/components/scheduled/schedule-form";
import { ScheduledTable } from "@/components/scheduled/scheduled-table";
import {
  useScheduledTransactions,
  type ScheduledTransaction,
} from "@/hooks/useScheduledTransactions";
import { scheduleLabel } from "@/lib/schedule-draft";

export const Route = createFileRoute("/budgets/$budgetId/scheduled/")({
  component: ScheduledPage,
});

function ScheduledPage() {
  const { budgetId } = Route.useParams();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [doomed, setDoomed] = useState<ScheduledTransaction | null>(null);

  const {
    scheduled,
    isLoading,
    openAccounts,
    payees,
    categoryOptions,
    create,
    update,
    remove,
    enter,
    skip,
    enterDue,
    isCreating,
    isSaving,
    isEntering,
    isSkipping,
    isEnteringDue,
    createError,
    updateError,
    deleteError,
    enterError,
    skipError,
    enterDueError,
    enterDueResult,
    resetStatus,
  } = useScheduledTransactions({ budgetId: Number(budgetId) });

  const due = scheduled.filter((row) => row.isDue);

  // The open panel is resolved against the live list each render, so a schedule
  // that has just been deleted or entered away drops out of it by itself.
  const editing = scheduled.find((row) => row.id === editingId);

  // A refusal names what it was made against, so changing subject drops it.
  function changeSubject(next: number | null) {
    resetStatus();
    setEditingId(next);
  }

  function confirmDelete(row: ScheduledTransaction) {
    resetStatus();
    setDoomed(row);
  }

  if (isLoading) {
    return (
      <CenteredMessage className="h-full">Loading scheduled transactions…</CenteredMessage>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Scheduled Transactions"
        subtitle={
          <>
            {scheduled.length} scheduled
            {due.length > 0 ? `, ${due.length} due` : ""}
          </>
        }
      />

      {due.length > 0 && (
        <DueBanner dueCount={due.length} isEnteringDue={isEnteringDue} onEnterDue={enterDue} />
      )}

      {enterDueResult && <EnterDueSummary result={enterDueResult} />}

      <ScheduleForm
        accounts={openAccounts}
        payees={payees}
        categoryOptions={categoryOptions}
        submitLabel={isCreating ? "Adding…" : "Add schedule"}
        isPending={isCreating}
        error={createError}
        onSubmit={create}
      />

      <ErrorList messages={[enterError, skipError, enterDueError, deleteError]} />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto">
          <ScheduledTable
            scheduled={scheduled}
            editingId={editingId}
            isEntering={isEntering}
            isSkipping={isSkipping}
            onEnter={enter}
            onSkip={skip}
            onEdit={(row) => changeSubject(row.id === editingId ? null : row.id)}
            onDelete={confirmDelete}
          />
        </div>

        {editing && (
          <ScheduleEditPanel
            schedule={editing}
            accounts={openAccounts}
            payees={payees}
            categoryOptions={categoryOptions}
            isSaving={isSaving}
            error={updateError}
            onSave={(values) => update(editing.id, values)}
            onClose={() => changeSubject(null)}
          />
        )}
      </div>

      {/* Skipping an occurrence leaves the schedule; deleting it does not. The
          transactions it already entered stay on the books either way. Mounted
          only while asking, as before, so it does not animate closed. */}
      {doomed && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDoomed(null)}
          title="Delete this scheduled transaction?"
          description={`"${scheduleLabel(doomed)}" will stop coming round. The transactions it has already entered stay, but the schedule itself cannot be brought back from here.`}
          confirmLabel="Delete"
          onConfirm={() => {
            if (doomed.id === editingId) setEditingId(null);
            remove(doomed.id);
          }}
        />
      )}
    </div>
  );
}

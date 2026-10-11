import { createFileRoute } from "@tanstack/react-router";
import { accountRegisterSearchSchema, type FlagColor } from "@znab/shared";
import { useEffect, useRef, useState } from "react";
import { CenteredMessage } from "@/components/common/centered-message";
import { AddRow } from "@/components/register/add-row";
import { RegisterBulkPanel } from "@/components/register/bulk-panel";
import { EditCells } from "@/components/register/edit-cells";
import { ReconcilePanel } from "@/components/register/reconcile-panel";
import { ReconcileSummary } from "@/components/register/reconcile-summary";
import { ReconciledWarningDialog } from "@/components/register/reconciled-warning-dialog";
import { RegisterColgroup } from "@/components/register/register-colgroup";
import { RegisterColumnHeader } from "@/components/register/register-column-header";
import { RegisterFilterBar } from "@/components/register/register-filter-bar";
import { RegisterHeader } from "@/components/register/register-header";
import { RegisterRow } from "@/components/register/register-row";
import { ShowNewer } from "@/components/register/show-newer";
import { ShowOlder } from "@/components/register/show-older";
import { TransactionCells } from "@/components/register/transaction-cells";
import { UpcomingPanel } from "@/components/register/upcoming-panel";
import { useReconcile } from "@/hooks/useReconcile";
import { useRegisterLookups } from "@/hooks/useRegisterLookups";
import {
  type RegisterClearedFilter,
  type RegisterTransaction,
  useRegisterPages,
} from "@/hooks/useRegisterPages";
import { useRegisterSelection } from "@/hooks/useRegisterSelection";
import { useRegisterUpcoming } from "@/hooks/useRegisterUpcoming";
import { useRegisterWrites } from "@/hooks/useRegisterWrites";
import { bulkDeleteNote, planBulkCategorise, planBulkCleared } from "@/lib/register-bulk";
import { emptyFields, fieldsFrom, isReconciled, locksFor } from "@/lib/register-edit";
import { unsaveableReason, type RegisterFields } from "@/lib/register-row";

export const Route = createFileRoute("/budgets/$budgetId/accounts/$accountId")({
  validateSearch: accountRegisterSearchSchema,
  component: AccountRegisterPage,
});

function AccountRegisterPage() {
  const { budgetId, accountId } = Route.useParams();
  const { cleared, q, sort, dir, txn: focusId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const ids = { budgetId: Number(budgetId), accountId: Number(accountId) };

  const [addFields, setAddFields] = useState<RegisterFields>(emptyFields);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addBlocked, setAddBlocked] = useState<string | null>(null);
  const [editBlocked, setEditBlocked] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  /** The reconciled row waiting to be told to open anyway. */
  const [warningId, setWarningId] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /** The row a link opened the register on, to bring into view once it loads. */
  const focusRowRef = useRef<HTMLTableRowElement>(null);
  /** The add row's payee control, so a saved row hands the keyboard straight back. */
  const addPayeeRef = useRef<HTMLButtonElement>(null);

  const pages = useRegisterPages({
    ...ids,
    cleared: cleared as RegisterClearedFilter,
    q,
    sort,
    dir,
    focusId,
  });
  const { transactions } = pages;
  const lookups = useRegisterLookups(ids);
  const { account, payeeList, categoryOptions, autofillForPayee, transferKeepsCategory } =
    lookups;
  const upcoming = useRegisterUpcoming(ids);
  const reconcile = useReconcile(ids);
  const selection = useRegisterSelection(transactions);
  const { selectedRows } = selection;
  const writes = useRegisterWrites({
    ...ids,
    transferKeepsCategory,
    onCreated: () => {
      // A refetch rather than a patch puts a back-dated row in the middle, so
      // the view goes to the bottom where the newest rows are.
      setTimeout(
        () =>
          scrollContainerRef.current?.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: "smooth",
          }),
        0
      );
      setAddFields(emptyFields());
      setAddBlocked(null);
      // Entering a run of transactions is the same few keystrokes over and
      // over, and the row let go of the keyboard the moment it was used, so
      // every transaction after the first began with reaching for the mouse.
      // The date is already back to today, so the payee is the next thing
      // anybody types.
      setTimeout(() => addPayeeRef.current?.focus(), 0);
      // A page opened on an old row leaves the newest off, and the row just
      // entered is usually one of them.
      if (focusId !== undefined) {
        navigate({ search: (prev) => ({ ...prev, txn: undefined }) });
      }
    },
  });

  // The row the warning is about, to word it for whichever side is reconciled.
  const warned =
    warningId === null ? undefined : transactions.find((t) => t.id === warningId);

  // A linked row is scrolled to once it is on the page, which is only after the
  // page around it has loaded. Keyed on its arrival rather than on every
  // refetch, so editing nearby does not keep dragging the view back to it.
  const focusLoaded = transactions.some((t) => t.id === focusId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusId re-runs the scroll when the link target changes while focusLoaded stays true
  useEffect(() => {
    if (focusLoaded) focusRowRef.current?.scrollIntoView({ block: "center" });
  }, [focusId, focusLoaded]);

  if (pages.isLoading) {
    return <CenteredMessage className="h-full">Loading transactions…</CenteredMessage>;
  }

  const lockRow = (row: Parameters<typeof locksFor>[0]) => locksFor(row, transferKeepsCategory);

  // Picking a transfer payee can take the category away mid-entry, so what is
  // saved is what the row shows. The draft keeps the old category in case the
  // payee is changed back to an ordinary one.
  const addPayee = payeeList?.find((p) => p.id === addFields.payeeId);
  const addLocks = lockRow({ transferAccountId: addPayee?.targetAccountId ?? null });
  const addDraft = addLocks.category ? { ...addFields, categoryId: null } : addFields;

  // A row that cannot be saved was being dropped on the floor: Enter did
  // nothing and said nothing. Both rows now say what they are waiting for, and
  // only once saving has actually been tried, so a half-typed row does not nag.
  function saveAdd() {
    const reason = unsaveableReason(addDraft);
    setAddBlocked(reason);
    writes.resetCreateStatus();
    if (!reason) writes.createTransaction(addDraft);
  }

  function saveEdit(txn: RegisterTransaction, fields: RegisterFields) {
    // A row already on the books may be worth nothing, so clearing both money
    // columns is a real edit here rather than an unfinished one.
    const reason = unsaveableReason(fields, { allowZero: true });
    setEditBlocked(reason);
    if (!reason) writes.updateTransaction(txn, fields, () => setEditingId(null));
  }

  /**
   * Flag a row where it sits. A colour is not a change to what the row says
   * happened, so it is written the moment it is picked rather than made to wait
   * for the row to be opened, and a reconciled row is not warned about either:
   * nothing here can put an account out of step with its statement.
   */
  function flagRow(txn: RegisterTransaction, flagColor: FlagColor | null) {
    writes.updateTransaction(txn, { ...fieldsFrom(txn), flagColor });
  }

  const editError = writes.updateError ?? writes.deleteError ?? editBlocked;

  // A failed edit's message belongs to the row it was made against, so moving
  // to another row, or away from editing entirely, drops it.
  function edit(id: number | null) {
    writes.resetEditStatus();
    setEditBlocked(null);
    setEditingId(id);
  }

  // A reconciled row is warned about rather than locked shut: it agrees with a
  // statement, and putting it out of step with one is a decision rather than an
  // accident. Every other row opens on the first click, as it always has.
  function requestEdit(txn: RegisterTransaction) {
    if (isReconciled(txn)) {
      setWarningId(txn.id);
      return;
    }
    edit(txn.id);
  }

  /**
   * What clicking a row means. The click was already spoken for: it opens the
   * row for editing, which is the register's main gesture and is not worth
   * taking away, so the modifiers decide instead. Ctrl or cmd-click and
   * shift-click always select. A plain click opens the row while nothing is
   * selected, and once something is, it moves the selection to that row rather
   * than opening it, so a selection can be built up and started over without
   * holding a key down the whole time. The panel's clear button and Escape both
   * end the selection, which puts a plain click back to opening rows.
   */
  function clickRow(event: React.MouseEvent, txn: RegisterTransaction) {
    if (!event.shiftKey && !event.metaKey && !event.ctrlKey && selectedRows.length === 0) {
      requestEdit(txn);
      return;
    }
    // A row being edited holds a draft that the panel would hide, and it is the
    // one row a bulk action has no business writing over, so selecting drops it
    // the same way clicking another row always has.
    if (editingId !== null) edit(null);
    selection.select(event, txn.id);
  }

  // A category is written to a reconciled row the way a flag is: it moves
  // budget activity, not what the account says it holds.
  function categoriseSelected(categoryId: number) {
    const plan = planBulkCategorise(selectedRows, (row) => !lockRow(row).category);
    for (const row of plan.targets) {
      writes.updateTransaction(row, { ...fieldsFrom(row), categoryId });
    }
    selection.setNote(plan.note);
  }

  function setClearedOnSelected(target: "Cleared" | "Uncleared") {
    const plan = planBulkCleared(selectedRows, target);
    for (const row of plan.targets) writes.cycleCleared(row.cleared, row.id);
    selection.setNote(plan.note);
  }

  // The selection is left as it is: a row that is really gone falls out of it on
  // the next read, and one whose delete was refused stays, with the error
  // against it in the panel.
  function deleteSelected() {
    for (const row of selectedRows) writes.deleteTransaction(row);
    selection.setNote(bulkDeleteNote(selectedRows.length));
  }

  return (
    <div className="flex flex-col h-full">
      <RegisterHeader
        account={account}
        clearedBalance={pages.clearedBalance}
        unclearedBalance={pages.unclearedBalance}
        balance={pages.balance}
        onReconcile={
          reconciling
            ? undefined
            : () => {
                reconcile.reset();
                // Reconciling is about ticking rows, so an open edit row would
                // only be in the way, and its draft is not worth keeping behind
                // a panel the reader cannot see it through.
                edit(null);
                setReconciling(true);
              }
        }
      />

      <RegisterFilterBar
        accountId={accountId}
        cleared={cleared}
        q={q}
        counts={pages.counts}
        matches={pages.matches}
        onClearedChange={(next) =>
          navigate({ search: (prev) => ({ ...prev, cleared: next, txn: undefined }) })
        }
        onSearch={(next) =>
          navigate({
            // Replace rather than push: typing a word should not put five
            // entries in the history between here and the way back.
            replace: true,
            search: (prev) => ({ ...prev, q: next || undefined, txn: undefined }),
          })
        }
      />

      {/* Between the header and the column headers, so the rows behind it stay
          clickable: ticking them off is how a statement gets reconciled. */}
      {reconciling ? (
        <ReconcilePanel
          clearedBalance={pages.clearedBalance}
          rows={transactions}
          hasMore={pages.hasMore}
          clearedFilter={cleared}
          isLoadingMore={pages.isLoadingMore}
          onLoadOlder={pages.loadOlder}
          isBusy={reconcile.isReconciling}
          error={reconcile.error}
          onFinish={(input) => reconcile.reconcile(input, () => setReconciling(false))}
          onCancel={() => setReconciling(false)}
        />
      ) : (
        reconcile.result && (
          <ReconcileSummary result={reconcile.result} onDismiss={reconcile.reset} />
        )
      )}

      {/* What is due and coming up, out of the way while a statement is being
          reconciled: that panel owns the screen until it is finished. */}
      {!reconciling && (
        <UpcomingPanel
          occurrences={upcoming.upcoming}
          onEnter={upcoming.enter}
          onSkip={upcoming.skip}
          isBusy={upcoming.isBusy}
          error={upcoming.error}
        />
      )}

      {/* The register itself, with the bulk panel alongside it. The three
          stacked tables share a colgroup to keep their columns lined up, so
          they have to narrow together when the panel opens. */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Sorting lives in the URL beside the filter, so a sorted register
              is a link too. A linked row's page is worked out in the unfiltered
              date order, so sorting, filtering or searching lets go of the link
              and starts again from the newest rows. */}
          <RegisterColumnHeader
            sort={sort}
            dir={dir}
            onSort={(column, nextDir) =>
              navigate({
                search: (prev) => ({ ...prev, sort: column, dir: nextDir, txn: undefined }),
              })
            }
          />

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
            {pages.hasMore && (
              <ShowOlder
                onLoadOlder={pages.loadOlder}
                isLoadingMore={pages.isLoadingMore}
                shown={transactions.length}
                total={pages.total}
              />
            )}

            <table className="w-full table-fixed text-sm">
              <RegisterColgroup />
              <tbody>
                {transactions.map((txn) => {
                  const editing = txn.id === editingId;
                  const onCycleCleared = () => writes.cycleCleared(txn.cleared, txn.id);
                  return (
                    <RegisterRow
                      key={txn.id}
                      editing={editing}
                      selected={selection.isSelected(txn.id)}
                      focused={txn.id === focusId}
                      rowRef={txn.id === focusId ? focusRowRef : undefined}
                      onClick={(e) => clickRow(e, txn)}
                      error={editError}
                    >
                      {editing ? (
                        <EditCells
                          key={txn.id}
                          txn={txn}
                          locks={lockRow(txn)}
                          payeeList={payeeList}
                          categoryOptions={categoryOptions}
                          autofillForPayee={autofillForPayee}
                          isBusy={writes.isSavingEdit}
                          onSave={(fields) => saveEdit(txn, fields)}
                          onDelete={() => writes.deleteTransaction(txn, () => setEditingId(null))}
                          onCancel={() => edit(null)}
                          onCycleCleared={onCycleCleared}
                        />
                      ) : (
                        <TransactionCells
                          txn={txn}
                          onFlag={(flagColor) => flagRow(txn, flagColor)}
                          onCycleCleared={onCycleCleared}
                        />
                      )}
                    </RegisterRow>
                  );
                })}
              </tbody>
            </table>

            {pages.hasNewer && (
              <ShowNewer
                onShowNewest={() => navigate({ search: (prev) => ({ ...prev, txn: undefined }) })}
              />
            )}

            {transactions.length === 0 && (
              <CenteredMessage className="h-32">No transactions found.</CenteredMessage>
            )}
          </div>

          <AddRow
            fields={addDraft}
            onChange={(patch) => setAddFields((prev) => ({ ...prev, ...patch }))}
            payeeList={payeeList}
            categoryOptions={categoryOptions}
            autofillForPayee={autofillForPayee}
            locks={addLocks}
            onSave={saveAdd}
            isSaving={writes.isSaving}
            error={addBlocked ?? writes.createError}
            payeeTriggerRef={addPayeeRef}
          />
        </div>

        {selectedRows.length > 0 && (
          <RegisterBulkPanel
            rows={selectedRows.map((row) => ({
              id: row.id,
              date: row.date,
              payeeName: row.payee?.name ?? "—",
              amount: row.amount,
              cleared: row.cleared,
              isTransfer: row.isTransfer,
              canCategorise: !lockRow(row).category,
            }))}
            categoryOptions={categoryOptions}
            onCategorise={categoriseSelected}
            onSetCleared={setClearedOnSelected}
            onDelete={deleteSelected}
            onClear={selection.clear}
            isBusy={writes.isSavingEdit}
            note={selection.note}
            error={writes.updateError ?? writes.deleteError}
          />
        )}
      </div>

      <ReconciledWarningDialog
        open={warningId !== null}
        onOpenChange={(open) => !open && setWarningId(null)}
        ownSide={warned?.cleared === "Reconciled"}
        lastReconciledDate={account?.lastReconciledDate}
        onConfirm={() => edit(warningId)}
      />
    </div>
  );
}

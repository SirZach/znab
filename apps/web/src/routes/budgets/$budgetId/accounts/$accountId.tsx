import { createFileRoute } from "@tanstack/react-router";
import {
  accountRegisterSearchSchema,
  FLAG_COLORS,
  type FlagColor,
  type RegisterSort,
  type SortDirection,
} from "@znab/shared";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Check, CheckCircle2, Circle, Lock, Trash2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountBalances } from "@/components/register/balances";
import { ReconcilePanel, ReconcileSummary } from "@/components/register/reconcile-panel";
import { UpcomingPanel } from "@/components/register/upcoming-panel";
import { ClearedFilter } from "@/components/register/cleared-filter";
import { SortHeader } from "@/components/register/sort-header";
import { RegisterBulkPanel } from "@/components/register/bulk-panel";
import {
  FlagCell,
  RegisterRowFields,
  type RegisterRowLocks,
} from "@/components/register/row-fields";
import {
  isReconciled,
  useAccountRegister,
  type RegisterTransaction,
} from "@/hooks/useAccountRegister";
import { amountToFields, unsaveableReason } from "@/lib/register-row";
import type { RegisterFields } from "@/lib/register-row";

export const Route = createFileRoute(
  "/budgets/$budgetId/accounts/$accountId"
)({
  validateSearch: accountRegisterSearchSchema,
  component: AccountRegisterPage,
});

const colgroup = (
  <colgroup>
    <col className="w-6" />
    <col className="w-28" />
    <col className="w-20" />
    <col />
    <col />
    <col />
    <col className="w-24" />
    <col className="w-24" />
    <col className="w-10" />
    <col className="w-28" />
  </colgroup>
);

/** Why the fields a row will not let anyone change here are the way they are. */
const TRANSFER_PAYEE_NOTE =
  "A transfer's payee is the account it moves money to. Delete this transaction and enter it again to send it somewhere else.";
const TRANSFER_CATEGORY_NOTE =
  "Money moved between two budgeted accounts has not been spent, so it is not categorised.";
const SPLIT_NOTE =
  "A split's categories and amounts belong to its parts, which this register cannot edit yet.";

const emptyFields = (): RegisterFields => ({
  date: new Date(),
  payeeId: null,
  payeeName: "",
  categoryId: null,
  memo: "",
  flagColor: null,
  checkNumber: "",
  outflow: "",
  inflow: "",
});

/**
 * The flag as a colour this register knows how to draw. The column behind it is
 * free text and the imported data was never checked against anything, so a
 * value outside the six shows as no flag rather than as a swatch of nothing.
 */
const flagColorOf = (value: string | null): FlagColor | null =>
  FLAG_COLORS.includes(value as FlagColor) ? (value as FlagColor) : null;

/** The row as it stands, ready to be edited. */
const fieldsFrom = (txn: RegisterTransaction): RegisterFields => ({
  // Local midnight, the way every other date in the register is read, so a row
  // does not shift a day on its way into the picker.
  date: new Date(txn.date + "T00:00:00"),
  payeeId: txn.payeeId,
  payeeName: txn.payee?.name ?? "",
  categoryId: txn.categoryId,
  memo: txn.memo ?? "",
  flagColor: flagColorOf(txn.flagColor),
  checkNumber: txn.checkNumber ?? "",
  ...amountToFields(txn.amount),
});

function AccountRegisterPage() {
  const { budgetId, accountId } = Route.useParams();
  const { cleared, q, sort, dir } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [addFields, setAddFields] = useState<RegisterFields>(emptyFields);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addBlocked, setAddBlocked] = useState<string | null>(null);
  const [editBlocked, setEditBlocked] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  /** The reconciled row waiting to be told to open anyway. */
  const [warningId, setWarningId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [anchorId, setAnchorId] = useState<number | null>(null);
  /** What the last bulk action did, including the rows it would not touch. */
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    account,
    transactions,
    balance,
    clearedBalance,
    unclearedBalance,
    hasMore,
    loadOlder,
    isLoadingMore,
    payeeList,
    categoryOptions,
    autofillForPayee,
    transferKeepsCategory,
    total,
    counts,
    isLoading,
    cycleCleared,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    reconcile,
    upcoming,
    enterScheduled,
    skipScheduled,
    isEnteringScheduled,
    isSkippingScheduled,
    enterScheduledError,
    skipScheduledError,
    isSaving,
    isSavingEdit,
    isReconciling,
    createError,
    updateError,
    deleteError,
    reconcileError,
    reconcileResult,
    resetStatus,
    resetCreateStatus,
    resetReconcileStatus,
  } = useAccountRegister({
    budgetId: Number(budgetId),
    accountId: Number(accountId),
    cleared: cleared as "all" | "Uncleared" | "Cleared" | "Reconciled",
    q,
    sort,
    dir,
    scrollRef: scrollContainerRef,
    onSaveSuccess: () => {
      setAddFields(emptyFields());
      setAddBlocked(null);
    },
  });

  // The row the warning is about, to word it for whichever side is reconciled.
  const warned =
    warningId === null ? undefined : transactions.find((t) => t.id === warningId);

  // The selection resolved against what is actually on screen, rather than held
  // as ids alone. A row that has been deleted, or that the cleared filter has
  // taken away, stops counting as selected on its own, which is what closes the
  // panel once a bulk delete has really happened and leaves it open, against the
  // rows that survived, when one was refused.
  const selectedRows = transactions.filter((t) => selectedIds.has(t.id));

  // Every row on screen in the order it appears, so a shift-click range and the
  // register agree on what lies between two rows.
  const visibleRowIds = transactions.map((t) => t.id);

  // Escape is the way out of a selection from the keyboard, since a plain click
  // no longer opens a row while one is held. A dialog or a picker takes Escape
  // for itself, so backing out of the delete confirmation does not also throw
  // away the selection it was about. The setters are stable, so this listens
  // once rather than reattaching as the selection changes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest("[role=dialog]")) return;
      setSelectedIds(new Set());
      setAnchorId(null);
      setBulkNote(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading transactions…</p>
      </div>
    );
  }

  /**
   * What a row will not let anyone change here. A transfer's payee is the
   * account on the other end, and a transfer carries a category on one side of
   * the pair at most: both rules the API enforces on save, so the register
   * shows them rather than fights them. A split's category and amount are the
   * sum of its parts, and there is no editor for those, so changing either here
   * would only break the split.
   */
  function locksFor(row: {
    isSplit?: boolean;
    isTransfer?: boolean;
    transferAccountId: number | null;
  }): RegisterRowLocks {
    const locks: RegisterRowLocks = {};
    if (row.isTransfer) locks.payee = TRANSFER_PAYEE_NOTE;
    if (row.isSplit) {
      locks.category = { label: "Split", reason: SPLIT_NOTE };
      locks.amount = SPLIT_NOTE;
    } else if (!transferKeepsCategory(row.transferAccountId)) {
      locks.category = { label: "No category", reason: TRANSFER_CATEGORY_NOTE };
    }
    return locks;
  }

  // Picking a transfer payee can take the category away mid-entry, so what is
  // saved is what the row shows. The draft keeps the old category in case the
  // payee is changed back to an ordinary one.
  const addPayee = payeeList?.find((p) => p.id === addFields.payeeId);
  const addLocks = locksFor({ transferAccountId: addPayee?.targetAccountId ?? null });
  const addDraft = addLocks.category ? { ...addFields, categoryId: null } : addFields;

  // A row that cannot be saved was being dropped on the floor: Enter did
  // nothing and said nothing. Both rows now say what they are waiting for, and
  // only once saving has actually been tried, so a half-typed row does not nag.
  function saveAdd() {
    const reason = unsaveableReason(addDraft);
    setAddBlocked(reason);
    resetCreateStatus();
    if (!reason) createTransaction(addDraft);
  }

  function saveEdit(txn: RegisterTransaction, fields: RegisterFields) {
    // A row already on the books may be worth nothing, so clearing both money
    // columns is a real edit here rather than an unfinished one.
    const reason = unsaveableReason(fields, { allowZero: true });
    setEditBlocked(reason);
    if (!reason) updateTransaction(txn, fields, () => setEditingId(null));
  }

  /**
   * Flag a row where it sits. A colour is not a change to what the row says
   * happened, so it is written the moment it is picked rather than made to wait
   * for the row to be opened, and a reconciled row is not warned about either:
   * nothing here can put an account out of step with its statement.
   */
  function flagRow(txn: RegisterTransaction, flagColor: FlagColor | null) {
    updateTransaction(txn, { ...fieldsFrom(txn), flagColor });
  }

  // Sorting lives in the URL beside the filter, so a sorted register is a link
  // too, and going back to the date order is going back a page.
  const sortProps = {
    sort,
    dir,
    onSort: (column: RegisterSort, nextDir: SortDirection) =>
      navigate({ search: (prev) => ({ ...prev, sort: column, dir: nextDir }) }),
  };

  const editError = updateError ?? deleteError ?? editBlocked;

  // A failed edit's message belongs to the row it was made against, so moving
  // to another row, or away from editing entirely, drops it.
  function edit(id: number | null) {
    resetStatus();
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

  function clearSelection() {
    setSelectedIds(new Set());
    setAnchorId(null);
    setBulkNote(null);
  }

  /**
   * Which rows the selection covers, the same three gestures the budget grid
   * uses: shift-click takes everything between the anchor and here, ctrl or
   * cmd-click adds or drops a single row, and anything else starts again from
   * this row alone.
   */
  function selectRow(event: React.MouseEvent, id: number) {
    setBulkNote(null);
    if (event.shiftKey && anchorId !== null) {
      const from = visibleRowIds.indexOf(anchorId);
      const to = visibleRowIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setSelectedIds(new Set(visibleRowIds.slice(lo, hi + 1)));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      });
      setAnchorId(id);
      return;
    }
    setSelectedIds(new Set([id]));
    setAnchorId(id);
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
    if (
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      selectedRows.length === 0
    ) {
      requestEdit(txn);
      return;
    }
    // A row being edited holds a draft that the panel would hide, and it is the
    // one row a bulk action has no business writing over, so selecting drops it
    // the same way clicking another row always has.
    if (editingId !== null) edit(null);
    selectRow(event, txn.id);
  }

  /**
   * Set one category on every selected row that can hold one, as the same
   * single-row update the editor sends. A split's categories belong to its
   * parts and a transfer between two budgeted accounts carries none, so those
   * rows are counted and left alone rather than sent a change that would be
   * refused. A reconciled row is written the way a flag is: a category moves
   * budget activity, not what the account says it holds, so it cannot put an
   * account out of step with the statement it was reconciled against.
   */
  function categoriseSelected(categoryId: number) {
    const eligible = selectedRows.filter((row) => !locksFor(row).category);
    for (const row of eligible) {
      updateTransaction(row, { ...fieldsFrom(row), categoryId });
    }
    const skipped = selectedRows.length - eligible.length;
    setBulkNote(
      `Categorised ${eligible.length} of ${selectedRows.length}.` +
        (skipped > 0 ? ` ${skipped} carry no category here and were left alone.` : "")
    );
  }

  /**
   * Tick every selected row off against the statement, or untick it. Rows
   * already where they are being asked to go are nothing to write, and a
   * reconciled one is refused by the API rather than moved back, so both are
   * counted out of the pass.
   */
  function setClearedOnSelected(target: "Cleared" | "Uncleared") {
    const locked = selectedRows.filter((row) => row.cleared === "Reconciled");
    const moving = selectedRows.filter(
      (row) => row.cleared !== "Reconciled" && row.cleared !== target
    );
    for (const row of moving) cycleCleared(row.cleared, row.id);
    setBulkNote(
      `Marked ${moving.length} of ${selectedRows.length} ${target.toLowerCase()}.` +
        (locked.length > 0
          ? ` ${locked.length} are reconciled, which cannot be undone from the register.`
          : "")
    );
  }

  // The selection is left as it is: a row that is really gone falls out of it on
  // the next read, and one whose delete was refused stays, with the error
  // against it in the panel.
  function deleteSelected() {
    for (const row of selectedRows) deleteTransaction(row);
    setBulkNote(`Deleting ${selectedRows.length}.`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-xl font-semibold">{account?.name ?? "Account"}</h2>
          <p className="text-sm text-muted-foreground capitalize">{account?.accountType}</p>
          <p className="text-xs text-muted-foreground">
            {account?.lastReconciledDate
              ? `Last reconciled ${formatDate(account.lastReconciledDate)} at ${formatCurrency(
                  account.lastReconciledBalance
                )}`
              : "Never reconciled"}
          </p>
        </div>
        <div className="flex items-end gap-6">
          <AccountBalances
            cleared={clearedBalance}
            uncleared={unclearedBalance}
            working={balance}
          />
          {!reconciling && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetReconcileStatus();
                // Reconciling is about ticking rows, so an open edit row would
                // only be in the way, and its draft is not worth keeping behind
                // a panel the reader cannot see it through.
                edit(null);
                setReconciling(true);
              }}
            >
              Reconcile
            </Button>
          )}
        </div>
      </div>

      {/* Which rows to show. It writes to the URL rather than to state, so a
          filtered register is a link, and reloading keeps what was chosen. */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-border">
        <ClearedFilter
          value={cleared}
          counts={counts}
          onChange={(next) =>
            navigate({ search: (prev) => ({ ...prev, cleared: next }) })
          }
        />
        {cleared !== "all" && (
          <span className="text-xs text-muted-foreground">
            Showing {counts[cleared]} of {counts.all}. The balances above are the
            whole account either way.
          </span>
        )}
      </div>

      {/* Between the header and the column headers, so the rows behind it stay
          clickable: ticking them off is how a statement gets reconciled. */}
      {reconciling ? (
        <ReconcilePanel
          clearedBalance={clearedBalance}
          rows={transactions}
          hasMore={hasMore}
          clearedFilter={cleared}
          isLoadingMore={isLoadingMore}
          onLoadOlder={loadOlder}
          isBusy={isReconciling}
          error={reconcileError}
          onFinish={(input) => reconcile(input, () => setReconciling(false))}
          onCancel={() => setReconciling(false)}
        />
      ) : (
        reconcileResult && (
          <ReconcileSummary result={reconcileResult} onDismiss={resetReconcileStatus} />
        )
      )}

      {/* What is due and coming up, out of the way while a statement is being
          reconciled: that panel owns the screen until it is finished. */}
      {!reconciling && (
        <UpcomingPanel
          occurrences={upcoming}
          onEnter={enterScheduled}
          onSkip={skipScheduled}
          isBusy={isEnteringScheduled || isSkippingScheduled}
          error={enterScheduledError ?? skipScheduledError}
        />
      )}

      {/* The register itself, with the bulk panel alongside it. The three
          stacked tables share a colgroup to keep their columns lined up, so
          they have to narrow together when the panel opens. */}
      <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

      {/* Sticky table header */}
      <table className="w-full text-sm border-b border-border">
        {colgroup}
        <thead>
          <tr className="text-muted-foreground">
            {/* The flag has nothing to label: it is a colour and no more. */}
            <th className="pl-2 py-2" />
            <SortHeader column="date" label="Date" className="px-6" {...sortProps} />
            <SortHeader column="checkNumber" label="Check" className="px-4" {...sortProps} />
            <SortHeader column="payee" label="Payee" className="px-4" {...sortProps} />
            <SortHeader column="category" label="Category" className="px-4" {...sortProps} />
            <SortHeader column="memo" label="Memo" className="px-4" {...sortProps} />
            {/* Outflow and Inflow are the two halves of one signed amount, so
                both head the same sort rather than two that cannot both exist. */}
            <SortHeader
              column="amount"
              label="Outflow"
              align="right"
              className="px-4"
              {...sortProps}
            />
            <SortHeader
              column="amount"
              label="Inflow"
              align="right"
              className="px-4"
              {...sortProps}
            />
            <SortHeader column="cleared" label="C" align="center" className="px-2" {...sortProps} />
            {/* Not sortable: it is a running total measured down the date
                order, so ordering by it would ask for the rows in the order of
                a number that only exists in another order. */}
            <th
              className="text-right px-6 py-2 font-medium"
              title={
                sort === "date"
                  ? undefined
                  : "Each row's balance as of its own date. Sorted by something other than date, the column no longer adds up down the page."
              }
            >
              Balance
              {sort !== "date" && <span className="ml-1 opacity-60">*</span>}
            </th>
          </tr>
        </thead>
      </table>

      {/* Scrollable transaction rows */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        {hasMore && (
          <div className="flex flex-col items-center gap-1 py-3 border-b border-border/50">
            <button
              onClick={loadOlder}
              disabled={isLoadingMore}
              className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {isLoadingMore ? "Loading…" : "Show older transactions"}
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Showing the most recent {transactions.length} of {total}
            </span>
          </div>
        )}

        <table className="w-full text-sm">
          {colgroup}
          <tbody>
            {transactions.map((txn) => {
              const amount = parseFloat(txn.amount);
              const isInflow = amount > 0;
              const editing = txn.id === editingId;
              const selected = selectedIds.has(txn.id);

              return (
                <Fragment key={txn.id}>
                  <tr
                    onClick={editing ? undefined : (e) => clickRow(e, txn)}
                    aria-selected={editing || selected}
                    className={cn(
                      "border-b border-border/50 transition-colors",
                      !editing && "cursor-pointer",
                      editing || selected ? "bg-accent/60" : "hover:bg-accent/30"
                    )}
                  >
                    {editing ? (
                      // Keyed so the draft is seeded from whichever row is being
                      // edited rather than carried over from the last one.
                      <EditCells
                        key={txn.id}
                        txn={txn}
                        locks={locksFor(txn)}
                        payeeList={payeeList}
                        categoryOptions={categoryOptions}
                        autofillForPayee={autofillForPayee}
                        isBusy={isSavingEdit}
                        onSave={(fields) => saveEdit(txn, fields)}
                        onDelete={() => deleteTransaction(txn, () => setEditingId(null))}
                        onCancel={() => edit(null)}
                        onCycleCleared={() => cycleCleared(txn.cleared, txn.id)}
                      />
                    ) : (
                      <>
                        <FlagCell
                          value={flagColorOf(txn.flagColor)}
                          onSelect={(flagColor) => flagRow(txn, flagColor)}
                        />
                        <td className="px-6 py-2 text-muted-foreground tabular-nums">
                          {formatDate(txn.date)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground tabular-nums">
                          {txn.checkNumber ?? ""}
                        </td>
                        <td className="px-4 py-2">{txn.payee?.name ?? "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {txn.isSplit
                            ? "Split"
                            : txn.category?.name ?? txn.categoryYnabId?.split("/").pop() ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground truncate max-w-48">
                          {txn.memo ?? ""}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {!isInflow ? formatCurrency(Math.abs(amount)) : ""}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-green-500">
                          {isInflow ? formatCurrency(amount) : ""}
                        </td>
                        <ClearedCell
                          cleared={txn.cleared}
                          onCycle={() => cycleCleared(txn.cleared, txn.id)}
                        />
                        <td className="px-6 py-2 text-right tabular-nums font-medium">
                          {formatCurrency(txn.runningBalance)}
                        </td>
                      </>
                    )}
                  </tr>

                  {editing && editError && (
                    <tr className="border-b border-border/50 bg-accent/60">
                      <td colSpan={10} className="px-6 pb-2">
                        <p className="text-xs text-destructive">{editError}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {transactions.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">No transactions found.</p>
          </div>
        )}
      </div>

      {/* Sticky add transaction row */}
      <table className="w-full text-sm border-t border-border bg-accent/20">
        {colgroup}
        <tbody>
          <tr>
            <RegisterRowFields
              fields={addDraft}
              onChange={(patch) => setAddFields((prev) => ({ ...prev, ...patch }))}
              payees={payeeList}
              categoryOptions={categoryOptions}
              autofill={autofillForPayee}
              locks={addLocks}
              onSubmit={saveAdd}
              tabIndexBase={1}
              nextCheckNumber={
                account?.lastEnteredCheckNum ? account.lastEnteredCheckNum + 1 : undefined
              }
            />
            <td className="px-2 py-2" />
            <td className="px-6 py-2 text-right">
              <button
                onClick={saveAdd}
                disabled={isSaving}
                className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </td>
          </tr>

          {(addBlocked ?? createError) && (
            <tr>
              <td colSpan={10} className="px-6 pb-2">
                <p className="text-xs text-destructive">{addBlocked ?? createError}</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>

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
              canCategorise: !locksFor(row).category,
            }))}
            categoryOptions={categoryOptions}
            onCategorise={categoriseSelected}
            onSetCleared={setClearedOnSelected}
            onDelete={deleteSelected}
            onClear={clearSelection}
            isBusy={isSavingEdit}
            note={bulkNote}
            error={updateError ?? deleteError}
          />
        )}
      </div>

      <Dialog open={warningId !== null} onOpenChange={(open) => !open && setWarningId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            {/* A transfer can be reconciled on its far side alone, since each
                account is reconciled against its own statement. Calling that
                "this transaction is reconciled" would be untrue, and it is the
                other account's statement that would be put out of step. */}
            {warned?.cleared === "Reconciled" ? (
              <>
                <DialogTitle>This transaction is reconciled</DialogTitle>
                <DialogDescription>
                  Changing it will put this account out of step with the statement it was
                  reconciled against
                  {account?.lastReconciledDate
                    ? ` on ${formatDate(account.lastReconciledDate)}`
                    : ""}
                  .
                </DialogDescription>
              </>
            ) : (
              <>
                <DialogTitle>The other side of this transfer is reconciled</DialogTitle>
                <DialogDescription>
                  This row is not, but the matching one in the other account is, and a
                  transfer's two halves move together. Changing it will put that account out
                  of step with the statement it was reconciled against.
                </DialogDescription>
              </>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWarningId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                edit(warningId);
                setWarningId(null);
              }}
            >
              Edit anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Cleared status ───────────────────────────────────────────────────────────

/**
 * The C column, which ticks a row off and unticks it again. Reconciled is not
 * part of that: a row gets there by being reconciled against a statement, so a
 * reconciled row shows its lock and stays put however often it is clicked.
 */
function ClearedCell({ cleared, onCycle }: { cleared: string; onCycle: () => void }) {
  const locked = cleared === "Reconciled";

  return (
    <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onCycle}
        className={cn(
          "transition-colors",
          locked ? "cursor-default" : "text-muted-foreground hover:text-foreground"
        )}
        title={locked ? "Reconciled against a statement" : cleared}
      >
        {cleared === "Reconciled" ? (
          <Lock size={14} className="text-primary" />
        ) : cleared === "Cleared" ? (
          <CheckCircle2 size={14} className="text-green-500" />
        ) : (
          <Circle size={14} />
        )}
      </button>
    </td>
  );
}

// ─── Editing a row ────────────────────────────────────────────────────────────

/**
 * A transaction already on the books, in place: the same controls the add row
 * uses, over a draft of its own. Enter commits and Escape reverts, both from
 * anywhere in the row; clicking another row drops the draft the same way.
 */
function EditCells({
  txn,
  locks,
  payeeList,
  categoryOptions,
  autofillForPayee,
  isBusy,
  onSave,
  onDelete,
  onCancel,
  onCycleCleared,
}: {
  txn: RegisterTransaction;
  locks: RegisterRowLocks;
  // Taken off the hook so the shapes are not restated here.
  payeeList: ReturnType<typeof useAccountRegister>["payeeList"];
  categoryOptions: ReturnType<typeof useAccountRegister>["categoryOptions"];
  autofillForPayee: ReturnType<typeof useAccountRegister>["autofillForPayee"];
  isBusy: boolean;
  onSave: (fields: RegisterFields) => void;
  onDelete: () => void;
  onCancel: () => void;
  onCycleCleared: () => void;
}) {
  const [fields, setFields] = useState<RegisterFields>(() => fieldsFrom(txn));
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <RegisterRowFields
        fields={fields}
        onChange={(patch) => setFields((prev) => ({ ...prev, ...patch }))}
        payees={payeeList}
        categoryOptions={categoryOptions}
        autofill={autofillForPayee}
        locks={locks}
        onSubmit={() => onSave(fields)}
        onCancel={onCancel}
        autoFocus
      />

      <ClearedCell cleared={txn.cleared} onCycle={onCycleCleared} />

      <td className="px-6 py-2 text-right">
        <span className="flex items-center justify-end gap-3">
          <button
            onClick={() => onSave(fields)}
            disabled={isBusy}
            aria-label="Save changes"
            title="Save changes"
            className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <Check size={15} />
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={isBusy}
            aria-label="Delete transaction"
            title="Delete transaction"
            className="text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </span>

        {/* Nothing else in this app confirms before it destroys, but a deleted
            transaction cannot be brought back from here, and deleting one side
            of a transfer takes the other account's row with it. */}
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete this transaction?</DialogTitle>
              <DialogDescription>
                {formatDate(txn.date)}, {txn.payee?.name ?? "no payee"},{" "}
                {formatCurrency(txn.amount)}.
                {txn.isTransfer
                  ? " This is a transfer, so the matching transaction in the other account goes too."
                  : ""}{" "}
                This cannot be undone here.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </td>
    </>
  );
}

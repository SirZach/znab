import { createFileRoute } from "@tanstack/react-router";
import { accountRegisterSearchSchema } from "@znab/shared";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Check, CheckCircle2, Circle, Lock, Trash2 } from "lucide-react";
import { Fragment, useRef, useState } from "react";
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
import { RegisterRowFields, type RegisterRowLocks } from "@/components/register/row-fields";
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
    <col className="w-28" />
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
  outflow: "",
  inflow: "",
});

/** The row as it stands, ready to be edited. */
const fieldsFrom = (txn: RegisterTransaction): RegisterFields => ({
  // Local midnight, the way every other date in the register is read, so a row
  // does not shift a day on its way into the picker.
  date: new Date(txn.date + "T00:00:00"),
  payeeId: txn.payeeId,
  payeeName: txn.payee?.name ?? "",
  categoryId: txn.categoryId,
  memo: txn.memo ?? "",
  ...amountToFields(txn.amount),
});

function AccountRegisterPage() {
  const { budgetId, accountId } = Route.useParams();
  const { cleared, q } = Route.useSearch();

  const [addFields, setAddFields] = useState<RegisterFields>(emptyFields);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addBlocked, setAddBlocked] = useState<string | null>(null);
  const [editBlocked, setEditBlocked] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  /** The reconciled row waiting to be told to open anyway. */
  const [warningId, setWarningId] = useState<number | null>(null);

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
    scrollRef: scrollContainerRef,
    onSaveSuccess: () => {
      setAddFields(emptyFields());
      setAddBlocked(null);
    },
  });

  // The row the warning is about, to word it for whichever side is reconciled.
  const warned =
    warningId === null ? undefined : transactions.find((t) => t.id === warningId);

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

      {/* Sticky table header */}
      <table className="w-full text-sm border-b border-border">
        {colgroup}
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left px-6 py-2 font-medium">Date</th>
            <th className="text-left px-4 py-2 font-medium">Payee</th>
            <th className="text-left px-4 py-2 font-medium">Category</th>
            <th className="text-left px-4 py-2 font-medium">Memo</th>
            <th className="text-right px-4 py-2 font-medium">Outflow</th>
            <th className="text-right px-4 py-2 font-medium">Inflow</th>
            <th className="text-center px-2 py-2 font-medium">C</th>
            <th className="text-right px-6 py-2 font-medium">Balance</th>
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

              return (
                <Fragment key={txn.id}>
                  <tr
                    onClick={editing ? undefined : () => requestEdit(txn)}
                    aria-selected={editing}
                    className={cn(
                      "border-b border-border/50 transition-colors",
                      editing ? "bg-accent/60" : "cursor-pointer hover:bg-accent/30"
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
                        <td className="px-6 py-2 text-muted-foreground tabular-nums">
                          {formatDate(txn.date)}
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
                      <td colSpan={8} className="px-6 pb-2">
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
              <td colSpan={8} className="px-6 pb-2">
                <p className="text-xs text-destructive">{addBlocked ?? createError}</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>

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

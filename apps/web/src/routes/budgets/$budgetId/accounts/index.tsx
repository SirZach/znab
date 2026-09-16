import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, ChevronUp, X } from "lucide-react";
import { ACCOUNT_TYPES, type AccountType } from "@znab/shared";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { groupAccounts } from "@/hooks/useBudgetLayout";
import { useAccounts, type ManagedAccount } from "@/hooks/useAccounts";
import { trpc } from "@/trpc";
import { cn, parseAmountExpression } from "@/lib/utils";

export const Route = createFileRoute("/budgets/$budgetId/accounts/")({
  component: AccountsPage,
});

/**
 * The stored type as YNAB 4 writes it. Only the run-together ones need saying
 * differently, so anything else is shown as it is stored.
 */
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CreditCard: "Credit Card",
  OtherLiability: "Other Liability",
  InvestmentAccount: "Investment",
};

const typeLabel = (accountType: string) =>
  ACCOUNT_TYPE_LABELS[accountType] ?? accountType;

/** Whether a balance in this type of account is money owed rather than held. */
const isCredit = (accountType: string) =>
  accountType === "CreditCard" || accountType === "OtherLiability";

const TRACKING_NOTE =
  "A tracking account is for money you do not budget, like a loan or an investment. Its balance counts towards net worth, but nothing in it is budgeted.";

const fieldClass =
  "rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function AccountsPage() {
  const { budgetId } = Route.useParams();

  const [editingId, setEditingId] = useState<number | null>(null);
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

  const { onBudgetAccounts, trackingAccounts, closedAccounts } =
    groupAccounts(accounts);
  const groups = [
    { label: "Budget Accounts", accounts: onBudgetAccounts },
    { label: "Tracking Accounts", accounts: trackingAccounts },
    { label: "Closed Accounts", accounts: closedAccounts },
  ].filter((group) => group.accounts.length > 0);

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

  function commitRename(account: ManagedAccount, draft: string) {
    setEditingId(null);
    const name = draft.trim();
    if (!name || name === account.name) return;
    rename(account.id, name);
  }

  /**
   * Swap a row with its neighbour in the same group. A group is a slice of the
   * one order the API keeps, so exchanging the pair where they sit in the whole
   * set is what moves the row on screen, and leaves every other account be.
   */
  function move(account: ManagedAccount, neighbour: ManagedAccount) {
    const ids = accounts.map((a) => a.id);
    const from = ids.indexOf(account.id);
    const to = ids.indexOf(neighbour.id);
    ids[from] = neighbour.id;
    ids[to] = account.id;
    reorder(ids);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading accounts…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-xl font-semibold">Accounts</h2>
        <p className="text-sm text-muted-foreground">
          {accounts.length - closedAccounts.length} open
          {closedAccounts.length > 0 ? `, ${closedAccounts.length} closed` : ""}
        </p>
      </div>

      <NewAccountForm
        onCreate={create}
        isCreating={isCreating}
        error={createError}
      />

      {(renameError || reorderError) && (
        <div className="px-6 py-2 border-b border-border">
          {renameError && <p className="text-xs text-destructive">{renameError}</p>}
          {reorderError && (
            <p className="text-xs text-destructive">{reorderError}</p>
          )}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.label}>
                  <tr>
                    <th
                      colSpan={3}
                      className="text-left px-6 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {group.label}
                    </th>
                  </tr>

                  {group.accounts.map((account, i) => {
                    const up = group.accounts[i - 1];
                    const down = group.accounts[i + 1];
                    return (
                      <tr
                        key={account.id}
                        onClick={() => inspect(account.id)}
                        aria-selected={account.id === inspectedId}
                        className={cn(
                          "border-b border-border/50 cursor-pointer transition-colors",
                          account.id === inspectedId
                            ? "bg-accent/60"
                            : "hover:bg-accent/30"
                        )}
                      >
                        <td
                          className="w-20 px-6 py-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="flex gap-1 text-muted-foreground">
                            <button
                              disabled={!up || isReordering}
                              onClick={() => up && move(account, up)}
                              aria-label={`Move ${account.name} up`}
                              className="rounded p-0.5 hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              disabled={!down || isReordering}
                              onClick={() => down && move(account, down)}
                              aria-label={`Move ${account.name} down`}
                              className="rounded p-0.5 hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </span>
                        </td>

                        <td className="px-2 py-2">
                          {editingId === account.id ? (
                            <NameInput
                              initial={account.name}
                              onCommit={(draft) => commitRename(account, draft)}
                              onCancel={() => setEditingId(null)}
                            />
                          ) : (
                            <button
                              onClick={() => setEditingId(account.id)}
                              title="Click to rename"
                              className="text-left rounded px-1 py-0.5 -mx-1 hover:bg-accent"
                            >
                              {account.name}
                            </button>
                          )}
                          {account.note && (
                            <span className="block text-xs text-muted-foreground truncate">
                              {account.note}
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-2 text-right text-muted-foreground">
                          {typeLabel(account.accountType)}
                          {!account.onBudget && (
                            <span className="ml-2 text-xs">tracking</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>

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

// ─── Inline rename ────────────────────────────────────────────────────────────

/**
 * An account name, editable in place: commits on blur or Enter, reverts on
 * Escape. Escape sets a flag rather than resetting the draft, since the blur it
 * triggers would otherwise read the draft as it was before React re-rendered.
 */
function NameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const cancelled = useRef(false);

  return (
    <input
      autoFocus
      aria-label="Account name"
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (cancelled.current ? onCancel() : onCommit(draft))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className="w-full bg-transparent rounded px-1 py-0.5 -mx-1 focus:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

// ─── Opening an account ───────────────────────────────────────────────────────

/**
 * The starting balance is what the account holds today, and the API files it as
 * a transaction dated as chosen. The type and the date are left as they were
 * after each save, since several accounts are usually opened at once.
 */
function NewAccountForm({
  onCreate,
  isCreating,
  error,
}: {
  onCreate: ReturnType<typeof useAccounts>["create"];
  isCreating: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("Checking");
  const [onBudget, setOnBudget] = useState(true);
  const [note, setNote] = useState("");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(() => new Date());

  const balanceText = balance.trim();
  const balanceValue =
    balanceText === "" ? null : parseAmountExpression(balanceText);
  const balanceInvalid = balanceText !== "" && balanceValue === null;
  const ready = name.trim() !== "" && !balanceInvalid && !isCreating;

  function submit() {
    onCreate(
      {
        name: name.trim(),
        accountType,
        onBudget,
        note: note.trim() || undefined,
        // A zero balance is no balance: it would only file a transaction that
        // says nothing.
        ...(balanceValue
          ? {
              startingBalance: balanceValue,
              startingBalanceDate: format(date, "yyyy-MM-dd"),
            }
          : {}),
      },
      () => {
        setName("");
        setNote("");
        setBalance("");
      }
    );
  }

  return (
    <div className="px-6 py-3 border-b border-border bg-accent/20">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">Name</span>
          <input
            type="text"
            placeholder="Checking"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) submit();
            }}
            className={cn(fieldClass, "w-48")}
          />
        </label>

        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">Type</span>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
            className={fieldClass}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">
            Budgeting
          </span>
          <select
            value={onBudget ? "budget" : "tracking"}
            onChange={(e) => setOnBudget(e.target.value === "budget")}
            className={fieldClass}
          >
            <option value="budget">Budget account</option>
            <option value="tracking">Tracking account</option>
          </select>
        </label>

        <label className="block min-w-40 flex-1">
          <span className="block text-xs text-muted-foreground mb-1">
            Note (optional)
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={cn(fieldClass, "w-full")}
          />
        </label>

        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">
            Balance today
          </span>
          <input
            // Text rather than a number input: these take arithmetic like
            // `25+13`, the same as every other money field in the app.
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className={cn(fieldClass, "w-28 text-right tabular-nums")}
          />
        </label>

        <div>
          <span className="block text-xs text-muted-foreground mb-1">As of</span>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="text-sm font-normal h-auto py-1.5 px-2"
                />
              }
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5 opacity-50" />
              {format(date, "MM/dd/yyyy")}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                // Clicking the selected day deselects it, and a balance has to
                // be dated, so that is ignored.
                onSelect={(next) => next && setDate(next)}
                // No account opened tomorrow, and a future opening balance
                // would sit past the end of the budget's own months. The API
                // refuses one too; this keeps it from being offered.
                disabled={{ after: new Date() }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <button
          disabled={!ready}
          onClick={submit}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isCreating ? "Adding…" : "Add account"}
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {TRACKING_NOTE} A credit card's balance is what you owe, so enter it as a
        negative amount.
      </p>
      {balanceInvalid && (
        <p className="text-xs text-destructive">
          Enter a balance like 1200.50, or leave it blank.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Side panel ───────────────────────────────────────────────────────────────

function AccountInspector({
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
  // Taken off the hook so the argument shapes are not restated here.
  onUpdate: ReturnType<typeof useAccounts>["update"];
  onSetHidden: ReturnType<typeof useAccounts>["setHidden"];
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
  const [accountType, setAccountType] = useState(
    account.accountType as AccountType
  );
  const [onBudget, setOnBudget] = useState(account.onBudget);
  const [note, setNote] = useState(account.note ?? "");
  const [confirming, setConfirming] = useState(false);

  // Moving an account into or out of the credit side changes what its balance
  // means, so the API refuses that once there is anything on the books. The
  // other side is left out of the picker rather than offered and then refused.
  const typeOptions = empty
    ? ACCOUNT_TYPES
    : ACCOUNT_TYPES.filter((t) => isCredit(t) === isCredit(account.accountType));

  const patch = {
    accountType:
      accountType === account.accountType ? undefined : accountType,
    onBudget: onBudget === account.onBudget ? undefined : onBudget,
    note: note === (account.note ?? "") ? undefined : note,
  };
  const dirty = Object.values(patch).some((v) => v !== undefined);

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{account.name}</h3>
          <p className="text-xs text-muted-foreground">
            {typeLabel(account.accountType)},{" "}
            {account.onBudget ? "budgeted" : "tracking"}
            {account.hidden ? ", closed" : ""}
            {used === null ? "" : `, ${used} transactions`}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <section className="px-4 py-3 border-b border-border space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Details
        </h4>

        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">Type</span>
          <select
            aria-label="Account type"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
            className={cn(fieldClass, "w-full")}
          >
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">
            Budgeting
          </span>
          <select
            aria-label="Budgeting"
            disabled={!empty}
            value={onBudget ? "budget" : "tracking"}
            onChange={(e) => setOnBudget(e.target.value === "budget")}
            className={cn(fieldClass, "w-full disabled:opacity-50")}
          >
            <option value="budget">Budget account</option>
            <option value="tracking">Tracking account</option>
          </select>
        </label>

        {used !== null && (
          <p className="text-xs text-muted-foreground">
            {empty
              ? TRACKING_NOTE
              : "An account with transactions keeps the kind of money it holds: its history is already budgeted, or already not."}
          </p>
        )}

        <input
          type="text"
          aria-label="Note"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={cn(fieldClass, "w-full")}
        />

        <button
          disabled={!dirty || isSaving}
          onClick={() => onUpdate(account.id, patch)}
          className="w-full rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>

        {updateError && <p className="text-xs text-destructive">{updateError}</p>}
      </section>

      <section className="px-4 py-3 border-b border-border space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {account.hidden ? "Reopening" : "Closing"}
        </h4>
        <p className="text-xs text-muted-foreground">
          {account.hidden
            ? "Reopening puts this account back in the sidebar and lets it take transactions again."
            : "Closing takes a paid-off or emptied account out of the way. Its history stays, and it can be reopened."}
        </p>
        <button
          onClick={() => onSetHidden(account.id, !account.hidden)}
          className="w-full rounded border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-accent transition-colors"
        >
          {account.hidden ? "Reopen account" : "Close account"}
        </button>
        {hiddenError && <p className="text-xs text-destructive">{hiddenError}</p>}
      </section>

      <section className="px-4 py-3">
        {used !== null &&
          (empty ? (
            <button
              onClick={() => setConfirming(true)}
              className="w-full rounded border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              Delete account
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Used by {used} transactions, so it cannot be deleted. Close it
              instead, which keeps the history.
            </p>
          ))}
        {deleteError && (
          <p className="mt-2 text-xs text-destructive">{deleteError}</p>
        )}

        {/* Closing an account can be undone from here; deleting one cannot. */}
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete this account?</DialogTitle>
              <DialogDescription>
                "{account.name}" has no transactions, so no history is lost, but
                it cannot be brought back from here.
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
                  onDelete(account.id);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </aside>
  );
}

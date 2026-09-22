import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeftRight, CalendarIcon, X } from "lucide-react";
import type { FrequencyValue } from "@znab/shared";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useScheduledTransactions,
  type NewScheduled,
  type ScheduledTransaction,
} from "@/hooks/useScheduledTransactions";
import { trpc } from "@/trpc";
import { FREQUENCY_OPTIONS, behindLabel, canSkip, frequencyLabel } from "@/lib/schedule";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateISO,
  formatDateShort,
  parseAmountExpression,
} from "@/lib/utils";

export const Route = createFileRoute("/budgets/$budgetId/scheduled/")({
  component: ScheduledPage,
});

const DUE_NOTE =
  "Entering a schedule writes the transaction it stands for and moves it on to its next date. Nothing is written until you ask for it.";

const fieldClass =
  "rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

const actionClass =
  "rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 transition-colors";

/** A stored date as the calendar wants it, read as a local day rather than UTC. */
const toDate = (iso: string) => new Date(`${iso}T00:00:00`);

/** How a frequency is written for a reader, with the stored value as a fallback. */

/** A schedule named for a dialog or a heading. */
const scheduleLabel = (row: ScheduledTransaction) =>
  `${row.payee?.name ?? "No payee"} for ${formatCurrency(row.amount)}`;

function ScheduledPage() {
  const { budgetId } = Route.useParams();
  const id = Number(budgetId);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [doomed, setDoomed] = useState<ScheduledTransaction | null>(null);

  const {
    scheduled,
    isLoading,
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
  } = useScheduledTransactions({ budgetId: id });

  const { data: accounts } = trpc.account.list.useQuery({ budgetId: id });
  const { data: payees } = trpc.payee.list.useQuery({ budgetId: id });
  const { data: categoryGroups } = trpc.category.list.useQuery({ budgetId: id });

  // A closed account takes no new transactions, so it is not offered as a home
  // for one that would keep arriving.
  const openAccounts = accounts?.filter((a) => !a.hidden) ?? [];

  // The register's picker hides system groups, and a schedule files its money
  // the same way a transaction does, so it offers the same list.
  const categoryOptions =
    categoryGroups
      ?.filter((g) => !g.isSystem)
      .flatMap((g) =>
        g.categories.map((c) => ({ id: c.id, label: `${g.name}: ${c.name}` }))
      ) ?? [];

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
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading scheduled transactions…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-xl font-semibold">Scheduled Transactions</h2>
        <p className="text-sm text-muted-foreground">
          {scheduled.length} scheduled
          {due.length > 0 ? `, ${due.length} due` : ""}
        </p>
      </div>

      {due.length > 0 && (
        <div className="px-6 py-3 border-b border-border bg-primary/5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {due.length === 1
                ? "1 schedule is due."
                : `${due.length} schedules are due.`}
            </p>
            <button
              disabled={isEnteringDue}
              onClick={enterDue}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isEnteringDue ? "Entering…" : "Enter all due"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{DUE_NOTE}</p>
        </div>
      )}

      {enterDueResult && (
        <div className="px-6 py-2 border-b border-border">
          <p className="text-xs text-muted-foreground">
            Entered {enterDueResult.entered} transaction
            {enterDueResult.entered === 1 ? "" : "s"} across{" "}
            {enterDueResult.schedules} schedule
            {enterDueResult.schedules === 1 ? "" : "s"}.
            {enterDueResult.cappedOut
              ? " Some schedules are still behind. Press Enter all due again to keep going."
              : ""}
          </p>
          {/* One schedule that cannot be entered no longer stops the rest, so
              what was passed over is named rather than silently left behind. */}
          {enterDueResult.skipped.length > 0 && (
            <p className="mt-1 text-xs text-destructive">
              {enterDueResult.skipped.length} could not be entered:{" "}
              {enterDueResult.skipped.map((s) => s.reason).join(" ")}
            </p>
          )}
        </div>
      )}

      <ScheduleForm
        accounts={openAccounts}
        payees={payees}
        categoryOptions={categoryOptions}
        submitLabel={isCreating ? "Adding…" : "Add schedule"}
        isPending={isCreating}
        error={createError}
        onSubmit={create}
      />

      {(enterError || skipError || enterDueError || deleteError) && (
        <div className="px-6 py-2 border-b border-border">
          {[enterError, skipError, enterDueError, deleteError]
            .filter((message) => message !== null)
            .map((message, i) => (
              <p key={i} className="text-xs text-destructive">
                {message}
              </p>
            ))}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-6 py-2 font-semibold">Next</th>
                <th className="text-left px-3 py-2 font-semibold">Frequency</th>
                <th className="text-left px-3 py-2 font-semibold">Payee</th>
                <th className="text-left px-3 py-2 font-semibold">Category</th>
                <th className="text-left px-3 py-2 font-semibold">Account</th>
                <th className="text-right px-3 py-2 font-semibold">Amount</th>
                <th className="text-left px-3 py-2 font-semibold">Memo</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {scheduled.map((row) => {
                const behind = behindLabel(row.dueCount);
                const isTransfer = row.isTransfer;
                return (
                  <tr
                    key={row.id}
                    aria-selected={row.id === editingId}
                    className={cn(
                      "border-b border-border/50",
                      row.id === editingId
                        ? "bg-accent/60"
                        : row.isDue && "bg-primary/5"
                    )}
                  >
                    <td className="px-6 py-2 whitespace-nowrap">
                      {formatDate(row.date)}
                      {row.isDue && (
                        <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                          due
                        </span>
                      )}
                      {behind && (
                        <span className="block text-xs text-muted-foreground">
                          {behind}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {frequencyLabel(row.frequency)}
                    </td>

                    <td className="px-3 py-2">
                      {row.payee?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {isTransfer && (
                        <span
                          title="Entering this moves money between two accounts, so both sides are written."
                          className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          <ArrowLeftRight size={11} />
                          transfer
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-muted-foreground">
                      {row.category?.name ?? "—"}
                    </td>

                    <td className="px-3 py-2 text-muted-foreground">
                      {row.account.name}
                    </td>

                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {formatCurrency(row.amount)}
                    </td>

                    <td className="px-3 py-2 text-muted-foreground truncate max-w-48">
                      {row.memo}
                    </td>

                    <td className="px-6 py-2 text-right whitespace-nowrap">
                      <button
                        disabled={isEntering}
                        onClick={() => enter(row.id)}
                        className={actionClass}
                      >
                        Enter
                      </button>
                      {/* A schedule that happens once has nothing to skip to,
                          and the API refuses it, so it is not offered. */}
                      {canSkip(row.frequency) && (
                        <button
                          disabled={isSkipping}
                          onClick={() => skip(row.id)}
                          className={actionClass}
                        >
                          Skip
                        </button>
                      )}
                      <button
                        onClick={() =>
                          changeSubject(row.id === editingId ? null : row.id)
                        }
                        className={actionClass}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => confirmDelete(row)}
                        className={cn(
                          actionClass,
                          "hover:bg-destructive/10 hover:text-destructive"
                        )}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {scheduled.length === 0 && (
            <p className="px-6 py-8 text-center text-muted-foreground">
              Nothing is scheduled yet. Add the first one above.
            </p>
          )}
        </div>

        {editing && (
          <aside className="w-96 shrink-0 border-l border-border bg-card overflow-y-auto">
            <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{scheduleLabel(editing)}</h3>
                <p className="text-xs text-muted-foreground">
                  {frequencyLabel(editing.frequency)}, next{" "}
                  {formatDate(editing.date)}
                </p>
              </div>
              <button
                onClick={() => changeSubject(null)}
                aria-label="Close"
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <ScheduleForm
              // Remounting per schedule is what resets the draft fields.
              key={editing.id}
              stacked
              accounts={openAccounts}
              payees={payees}
              categoryOptions={categoryOptions}
              initial={editing}
              submitLabel={isSaving ? "Saving…" : "Save changes"}
              isPending={isSaving}
              error={updateError}
              onSubmit={(values) => update(editing.id, values)}
            />
          </aside>
        )}
      </div>

      {/* Skipping an occurrence leaves the schedule; deleting it does not. The
          transactions it already entered stay on the books either way. */}
      {doomed && (
        <Dialog open onOpenChange={(open) => !open && setDoomed(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete this scheduled transaction?</DialogTitle>
              <DialogDescription>
                "{scheduleLabel(doomed)}" will stop coming round. The
                transactions it has already entered stay, but the schedule
                itself cannot be brought back from here.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDoomed(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDoomed(null);
                  if (doomed.id === editingId) setEditingId(null);
                  remove(doomed.id);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── The form, for a new schedule and for changing one ────────────────────────

/** A payee as the picker needs it. */
type PickablePayee = { id: number; name: string };

type Draft = {
  accountId: number | null;
  payeeId: number | null;
  payeeName: string;
  categoryId: number | null;
  /** Kept apart from the amount so nobody has to type a minus sign. */
  outflow: boolean;
  amount: string;
  date: Date;
  frequency: FrequencyValue;
  twiceMonthDay: number | null;
  memo: string;
};

function draftFrom(row: ScheduledTransaction | undefined): Draft {
  if (!row)
    return {
      accountId: null,
      payeeId: null,
      payeeName: "",
      categoryId: null,
      outflow: true,
      amount: "",
      date: new Date(),
      frequency: "Monthly",
      twiceMonthDay: null,
      memo: "",
    };

  const amount = Number(row.amount);
  return {
    accountId: row.accountId,
    payeeId: row.payeeId,
    payeeName: row.payee?.name ?? "",
    categoryId: row.categoryId,
    outflow: amount < 0,
    amount: String(Math.abs(amount)),
    date: toDate(row.date),
    frequency: row.frequency as FrequencyValue,
    twiceMonthDay: row.twiceMonthDay,
    memo: row.memo ?? "",
  };
}

/**
 * Everything a schedule is made of, laid out across a band for a new one and
 * stacked down the side panel for one being changed. Both go through the same
 * fields so the two cannot drift apart.
 */
function ScheduleForm({
  stacked = false,
  accounts,
  payees,
  categoryOptions,
  initial,
  submitLabel,
  isPending,
  error,
  onSubmit,
}: {
  stacked?: boolean;
  accounts: Array<{ id: number; name: string }>;
  payees: PickablePayee[] | undefined;
  categoryOptions: Array<{ id: number; label: string }>;
  initial?: ScheduledTransaction;
  submitLabel: string;
  isPending: boolean;
  error: string | null;
  /** `done` clears the form, for the caller that only wants it cleared on a save. */
  onSubmit: (values: NewScheduled, done: () => void) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [payeeOpen, setPayeeOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const amountValue = parseAmountExpression(draft.amount);
  const amountInvalid = draft.amount.trim() !== "" && amountValue === null;
  const ready = draft.accountId !== null && amountValue !== null && !isPending;

  // Only TwiceAMonth reads a start day, and it falls back to the day the series
  // starts on, which is the answer nearly everyone wants.
  const startDay = draft.twiceMonthDay ?? draft.date.getDate();

  const payeeLabel = draft.payeeId
    ? payees?.find((p) => p.id === draft.payeeId)?.name
    : draft.payeeName;

  function submit() {
    if (!ready || draft.accountId === null || amountValue === null) return;
    const name = draft.payeeName.trim();
    onSubmit(
      {
        accountId: draft.accountId,
        payeeId: draft.payeeId,
        // A name with no id behind it is a payee the API makes on the way in.
        ...(draft.payeeId === null && name ? { payeeName: name } : {}),
        categoryId: draft.categoryId,
        amount: draft.outflow ? -Math.abs(amountValue) : Math.abs(amountValue),
        date: formatDateISO(draft.date),
        frequency: draft.frequency,
        twiceMonthDay: draft.frequency === "TwiceAMonth" ? startDay : null,
        memo: draft.memo.trim(),
      },
      // The account, the date and the frequency stay put: several schedules are
      // usually added at once, and they tend to share those three.
      () => set({ payeeId: null, payeeName: "", categoryId: null, amount: "", memo: "" })
    );
  }

  const field = stacked ? "w-full" : "w-40";

  return (
    <div
      className={cn(
        stacked
          ? "px-4 py-3 space-y-2"
          : "px-6 py-3 border-b border-border bg-accent/20"
      )}
    >
      <div
        className={cn(
          stacked ? "space-y-2" : "flex flex-wrap items-end gap-3"
        )}
      >
        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">Account</span>
          <select
            value={draft.accountId ?? ""}
            onChange={(e) => set({ accountId: Number(e.target.value) })}
            className={cn(fieldClass, field)}
          >
            <option value="" disabled>
              Pick an account
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <div className="block">
          <span className="block text-xs text-muted-foreground mb-1">Payee</span>
          <Popover open={payeeOpen} onOpenChange={setPayeeOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "justify-start text-left text-sm font-normal h-auto py-1.5 px-2",
                    field
                  )}
                />
              }
            >
              {payeeLabel || <span className="text-muted-foreground">Payee</span>}
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search payees..."
                  value={draft.payeeName}
                  onValueChange={(val) => set({ payeeName: val, payeeId: null })}
                />
                <CommandList>
                  <CommandEmpty>
                    {draft.payeeName
                      ? `Add "${draft.payeeName}"`
                      : "No payees found."}
                  </CommandEmpty>
                  <CommandGroup>
                    {payees?.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        onSelect={() => {
                          set({ payeeId: p.id, payeeName: p.name });
                          setPayeeOpen(false);
                        }}
                      >
                        {p.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="block">
          <span className="block text-xs text-muted-foreground mb-1">
            Category
          </span>
          <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "justify-start text-left text-sm font-normal h-auto py-1.5 px-2",
                    field
                  )}
                />
              }
            >
              {draft.categoryId ? (
                categoryOptions.find((c) => c.id === draft.categoryId)?.label
              ) : (
                <span className="text-muted-foreground">Category</span>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search categories..." />
                <CommandList>
                  <CommandEmpty>No categories found.</CommandEmpty>
                  <CommandGroup>
                    {categoryOptions.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.label}
                        onSelect={() => {
                          set({ categoryId: c.id });
                          setCategoryOpen(false);
                        }}
                      >
                        {c.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">
            Direction
          </span>
          <select
            value={draft.outflow ? "outflow" : "inflow"}
            onChange={(e) => set({ outflow: e.target.value === "outflow" })}
            className={cn(fieldClass, stacked ? "w-full" : "w-28")}
          >
            <option value="outflow">Outflow</option>
            <option value="inflow">Inflow</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">Amount</span>
          <input
            // Text rather than a number input: these take arithmetic like
            // `25+13`, the same as every other money field in the app.
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={draft.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className={cn(
              fieldClass,
              "text-right tabular-nums",
              stacked ? "w-full" : "w-28"
            )}
          />
        </label>

        <div className="block">
          <span className="block text-xs text-muted-foreground mb-1">
            Next date
          </span>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-sm font-normal h-auto py-1.5 px-2",
                    stacked ? "w-full" : ""
                  )}
                />
              }
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5 opacity-50" />
              {formatDateShort(draft.date)}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={draft.date}
                // Clicking the selected day deselects it, and a schedule has to
                // be dated, so that is ignored.
                onSelect={(next) => next && set({ date: next })}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <label className="block">
          <span className="block text-xs text-muted-foreground mb-1">
            Frequency
          </span>
          <select
            value={draft.frequency}
            onChange={(e) =>
              set({ frequency: e.target.value as FrequencyValue })
            }
            className={cn(fieldClass, field)}
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {/* Only TwiceAMonth reads a start day, so nothing else is asked for one. */}
        {draft.frequency === "TwiceAMonth" && (
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">
              Start day
            </span>
            <select
              value={startDay}
              onChange={(e) => set({ twiceMonthDay: Number(e.target.value) })}
              className={cn(fieldClass, stacked ? "w-full" : "w-20")}
            >
              {/* Only the first of the pair is chosen; the second falls fifteen
                  days later, so past the 15th the two would collapse together
                  at the end of a short month. */}
              {Array.from({ length: 15 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className={cn("block", stacked ? "" : "min-w-40 flex-1")}>
          <span className="block text-xs text-muted-foreground mb-1">
            Memo (optional)
          </span>
          <input
            type="text"
            value={draft.memo}
            onChange={(e) => set({ memo: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) submit();
            }}
            className={cn(fieldClass, "w-full")}
          />
        </label>

        <button
          disabled={!ready}
          onClick={submit}
          className={cn(
            "rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors",
            stacked && "w-full"
          )}
        >
          {submitLabel}
        </button>
      </div>

      {amountInvalid && (
        <p className="mt-2 text-xs text-destructive">
          Enter an amount like 45.50, or arithmetic like 25+13.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

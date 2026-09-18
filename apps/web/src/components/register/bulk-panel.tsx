import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { formatCurrency, formatDate } from "@/lib/utils";

/** A selected row, as much of it as the panel has to list or reason about. */
export type BulkRow = {
  id: number;
  date: string;
  payeeName: string;
  amount: string;
  cleared: string;
  isTransfer: boolean;
  /**
   * False where the row's category is held somewhere this register cannot
   * reach: a split's parts, or the other side of a transfer. Such a row is left
   * out of a bulk categorise rather than sent a change that would be refused.
   */
  canCategorise: boolean;
};

/**
 * Shown beside the register while rows are selected, so a run of transactions
 * can be categorised, ticked off or deleted in one pass. Every action here is
 * the register's own single-row write repeated over the selection, so the panel
 * holds no queries of its own: it lists what it is given and hands back what was
 * asked for, and the register tells it what each pass actually did.
 */
export function RegisterBulkPanel({
  rows,
  categoryOptions,
  onCategorise,
  onSetCleared,
  onDelete,
  onClear,
  isBusy,
  note,
  error,
}: {
  rows: BulkRow[];
  categoryOptions: Array<{ id: number; label: string }>;
  onCategorise: (categoryId: number) => void;
  onSetCleared: (cleared: "Cleared" | "Uncleared") => void;
  onDelete: () => void;
  onClear: () => void;
  isBusy: boolean;
  /** What the last action did, the rows it would not touch included. */
  note: string | null;
  error: string | null;
}) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const count = `${rows.length} transaction${rows.length === 1 ? "" : "s"}`;
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const categorisable = rows.filter((r) => r.canCategorise).length;
  const reconciled = rows.filter((r) => r.cleared === "Reconciled").length;
  const transfers = rows.filter((r) => r.isTransfer).length;

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h3 className="font-semibold">{count} selected</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(total)} between them
          </p>
        </div>
        <button
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear the selection and go back to opening rows for editing"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {(note ?? error) && (
        <div className="px-4 py-2 border-b border-border space-y-1">
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      <section className="px-4 py-3 border-b border-border">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Categorise them
        </h4>
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                role="combobox"
                disabled={isBusy || categorisable === 0}
                className="w-full justify-start text-left text-sm font-normal text-muted-foreground"
              />
            }
          >
            Choose a category
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
                        setCategoryOpen(false);
                        onCategorise(c.id);
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
        {categorisable < rows.length && (
          <p className="text-xs text-muted-foreground mt-2">
            {categorisable} of {rows.length} can take one. A split's categories belong to its
            parts, and money moved between two budgeted accounts is categorised nowhere.
          </p>
        )}
      </section>

      <section className="px-4 py-3 border-b border-border">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Cleared
        </h4>
        <div className="flex gap-2">
          {(["Cleared", "Uncleared"] as const).map((target) => (
            <button
              key={target}
              onClick={() => onSetCleared(target)}
              disabled={isBusy}
              className="flex-1 rounded border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            >
              Mark {target.toLowerCase()}
            </button>
          ))}
        </div>
        {reconciled > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {reconciled} of them are reconciled against a statement and stay as they are.
          </p>
        )}
      </section>

      <section className="px-4 py-3 border-b border-border">
        <button
          onClick={() => setConfirming(true)}
          disabled={isBusy}
          className="w-full rounded border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-destructive hover:bg-accent disabled:opacity-50 transition-colors"
        >
          Delete them
        </button>

        {/* The same confirmation a single delete gets, for the same reason: none
            of this comes back from here, and a transfer takes the other
            account's row with it however many are going at once. */}
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete {count}?</DialogTitle>
              <DialogDescription>
                {formatCurrency(total)} between them.
                {transfers > 0
                  ? ` ${transfers} ${
                      transfers === 1 ? "is a transfer" : "are transfers"
                    }, so the matching transaction in the other account goes too.`
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
      </section>

      <section className="px-4 py-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Selected
        </h4>
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 text-sm">
              <span className="truncate text-muted-foreground">
                {formatDate(r.date)} {r.payeeName}
              </span>
              <span className="tabular-nums shrink-0">{formatCurrency(r.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

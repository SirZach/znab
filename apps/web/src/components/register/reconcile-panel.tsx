import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BalanceFigure } from "@/components/register/balance-figure";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { MoneyInput } from "@/components/common/money-input";
import { clearedBalanceAsOf, type ReconcilableRow, reconcileDifference } from "@znab/shared";
import { coversStatement } from "@/lib/reconcile";
import { cn, formatCurrency, formatDateISO, formatDateShort, parseAmountExpression } from "@/lib/utils";

/** What Finish sends, once the reader has agreed to any adjustment it needs. */
export type ReconcileInput = {
  statementDate: string;
  statementBalance: number;
  adjustment: boolean;
};

/**
 * Reconciling, in a panel rather than a dialog: the register rows behind it
 * have to stay clickable, since ticking them off against the statement is the
 * whole exercise. Each tick refetches the account, so the cleared balance and
 * the difference move as the reader works down the statement.
 */
export function ReconcilePanel({
  clearedBalance,
  rows,
  hasMore,
  clearedFilter,
  isLoadingMore,
  onLoadOlder,
  isBusy,
  error,
  onFinish,
  onCancel,
}: {
  /** The account's cleared balance today, over its whole history. */
  clearedBalance: number;
  /** The register as loaded, to date that balance back to the statement. */
  rows: readonly ReconcilableRow[];
  /** Whether older transactions remain unloaded, and the filter narrowing them. */
  hasMore: boolean;
  clearedFilter: string;
  isLoadingMore: boolean;
  onLoadOlder: () => void;
  isBusy: boolean;
  error: string | null;
  onFinish: (input: ReconcileInput) => void;
  onCancel: () => void;
}) {
  // Most statements being reconciled are the one that just arrived.
  const [date, setDate] = useState(() => new Date());
  const [statement, setStatement] = useState("");
  const [confirming, setConfirming] = useState(false);

  const statementDate = formatDateISO(date);
  const clearedAsOf = clearedBalanceAsOf(clearedBalance, rows, statementDate);

  // The cleared balance is dated back by taking loaded rows off it, so a
  // statement older than the register has loaded would be measured against an
  // incomplete subtraction. Rather than show a difference that looks settled
  // and let the API contradict it, the panel says what it is missing.
  const covers = coversStatement({
    statementDate,
    oldestLoadedDate: rows[0]?.date,
    hasMore,
    clearedFilter,
  });

  // Nothing readable typed yet leaves the figures that depend on it off the
  // panel: a difference of nothing would read as a statement that agrees. The
  // difference shown is a reader's guide and the API is the authority, so a
  // register scrolled short of the statement date is refused rather than
  // reconciled wrongly.
  const typed = parseAmountExpression(statement);
  const figures =
    typed === null
      ? null
      : {
          statementBalance: typed,
          difference: reconcileDifference({ statementBalance: typed, clearedBalance: clearedAsOf }),
        };

  function finish(adjustment: boolean) {
    if (!figures) return;
    setConfirming(false);
    onFinish({ statementDate, statementBalance: figures.statementBalance, adjustment });
  }

  return (
    <div className="px-6 py-3 border-b border-border bg-accent/20">
      <p className="text-xs text-muted-foreground mb-2">
        Enter the statement's closing balance, then tick each transaction it lists in the C
        column until the difference is nothing.
      </p>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-4">
          <div>
            <span className="block text-xs text-muted-foreground mb-1">Statement date</span>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="text-sm font-normal h-auto py-1 px-2"
                  />
                }
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5 opacity-50" />
                {formatDateShort(date)}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  // Clicking the selected day deselects it, and a statement
                  // without a date is not a statement, so that is ignored.
                  onSelect={(next) => next && setDate(next)}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label
              htmlFor="statement-balance"
              className="block text-xs text-muted-foreground mb-1"
            >
              Statement balance
            </label>
            <MoneyInput
              id="statement-balance"
              variant="underline"
              autoFocus
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && onCancel()}
              className="w-28 tabular-nums"
            />
          </div>
        </div>

        <dl className="flex items-end gap-6 text-right">
          <BalanceFigure
            label="Cleared balance"
            value={clearedAsOf}
            className="text-muted-foreground"
          />
          {figures && (
            <>
              <BalanceFigure
                label="Statement"
                value={figures.statementBalance}
                className="text-muted-foreground"
              />
              {covers ? (
                <BalanceFigure
                  label="Difference"
                  value={figures.difference}
                  className={cn(
                    "text-lg font-semibold",
                    figures.difference === 0 && "text-green-500"
                  )}
                />
              ) : (
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Difference</span>
                  <span className="text-sm text-muted-foreground">Not yet known</span>
                </div>
              )}
            </>
          )}
        </dl>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!figures || !covers || isBusy}
            onClick={() => (figures?.difference === 0 ? finish(false) : setConfirming(true))}
          >
            Finish
          </Button>
        </div>
      </div>

      {!covers && (
        <p className="mt-2 text-xs text-muted-foreground">
          {clearedFilter !== "all"
            ? "Clear the cleared-status filter to reconcile: this register is showing only some of its transactions, and the rest still count towards the balance."
            : "This statement closes before the oldest transaction loaded, so what has cleared since it is not all here yet."}{" "}
          {clearedFilter === "all" && (
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={isLoadingMore}
              className="underline hover:text-foreground disabled:opacity-50"
            >
              {isLoadingMore ? "Loading older transactions…" : "Load older transactions"}
            </button>
          )}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {/* A difference the reader accepts is written as a transaction of its
          own, so it is asked about rather than entered on their behalf. */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="This statement does not agree"
        description={
          <>
            A balance adjustment of {formatCurrency(figures?.difference ?? 0)} will be
            entered to make the account agree with the statement, and everything ticked as
            cleared will be marked reconciled.
          </>
        }
        confirmLabel="Enter adjustment"
        variant="default"
        onConfirm={() => finish(true)}
      />
    </div>
  );
}

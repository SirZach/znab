import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BalanceFigure } from "@/components/register/balance-figure";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DateEntryInput } from "@/components/common/date-entry-input";
import { MoneyInput } from "@/components/common/money-input";
import { reconcileFigures } from "@/lib/reconcile";
import { cn, formatCurrency, formatDateISO } from "@/lib/utils";
import { trpc } from "@/trpc";

/** What Finish sends, once the reader has agreed to any adjustment it needs. */
export type ReconcileInput = {
  statementDate: string;
  statementBalance: number;
  adjustment: boolean;
};

/**
 * Reconciling, in a panel rather than a dialog: the register rows behind it
 * have to stay clickable, since ticking them off against the statement is the
 * whole exercise. Each tick invalidates the account router, so the cleared
 * balance and the difference move as the reader works down the statement.
 */
export function ReconcilePanel({
  budgetId,
  accountId,
  isBusy,
  error,
  onFinish,
  onCancel,
}: {
  budgetId: number;
  accountId: number;
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
  // Worked out by the API over the whole history, the same sum Finish decides
  // on, rather than dated back from the rows the register happens to have
  // loaded: that estimate gave up ("Not yet known") whenever a filter was on
  // or the statement predated the loaded window. The previous date's figure
  // stands in while a new one loads, so the panel does not flicker.
  const { data } = trpc.account.clearedBalanceAsOf.useQuery(
    { budgetId, accountId, date: statementDate },
    { placeholderData: (previous) => previous }
  );
  const clearedAsOf = data?.clearedBalance;
  const { statementBalance, difference } = reconcileFigures(statement, clearedAsOf);

  function finish(adjustment: boolean) {
    if (statementBalance === null) return;
    setConfirming(false);
    onFinish({ statementDate, statementBalance, adjustment });
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
            <label
              htmlFor="statement-date"
              className="block text-xs text-muted-foreground mb-1"
            >
              Statement date
            </label>
            {/* The first field, so it takes the keyboard as the panel opens,
                selected so typing a date replaces today's. */}
            <DateEntryInput
              id="statement-date"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={date}
              // Clicking the selected day deselects it, and a statement
              // without a date is not a statement, so that is ignored.
              onChange={(next) => next && setDate(next)}
              onKeyDown={(e) => e.key === "Escape" && onCancel()}
              className="w-24"
            />
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
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && onCancel()}
              className="w-28 tabular-nums"
            />
          </div>
        </div>

        <dl className="flex items-end gap-6 text-right">
          {clearedAsOf !== undefined && (
            <BalanceFigure
              label="Cleared balance"
              value={clearedAsOf}
              className="text-muted-foreground"
            />
          )}
          {statementBalance !== null && (
            <BalanceFigure
              label="Statement"
              value={statementBalance}
              className="text-muted-foreground"
            />
          )}
          {difference !== null ? (
            <BalanceFigure
              label="Difference"
              value={difference}
              className={cn("text-lg font-semibold", difference === 0 && "text-green-500")}
            />
          ) : (
            <div>
              <dt className="text-xs text-muted-foreground">Difference</dt>
              <dd className="text-sm text-muted-foreground">
                {/* Typed but not yet measured only while the first figure loads. */}
                {statementBalance === null ? "Not yet known" : "…"}
              </dd>
            </div>
          )}
        </dl>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={difference === null || isBusy}
            onClick={() => (difference === 0 ? finish(false) : setConfirming(true))}
          >
            Finish
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {/* A difference the reader accepts is written as a transaction of its
          own, so it is asked about rather than entered on their behalf. */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="This statement does not agree"
        description={
          <>
            A balance adjustment of {formatCurrency(difference ?? 0)} will be
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

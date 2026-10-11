import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { trpc } from "@/trpc";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** "Wed, Mar 10, 2025", read as the calendar day it names. */
export const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Every transaction behind one day of the spending calendar, under the same
 * filters, so the total is the day's figure. Each opens in its account's
 * register, as the budget's Spent list does.
 */
export function SpendingCalendarDay({
  budgetId,
  date,
  accountIds,
  categoryIds,
  onClose,
}: {
  budgetId: number;
  date: string;
  accountIds?: number[];
  categoryIds?: number[];
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.report.dayTransactions.useQuery({ budgetId, date, accountIds, categoryIds });
  const transactions = data?.transactions ?? [];

  return (
    <section aria-label={`Spending on ${longDate(date)}`} className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">
          {longDate(date)}
          {data && (
            <span className="ml-3 font-normal text-muted-foreground tabular-nums">{formatCurrency(data.total)}</span>
          )}
        </h3>
        <Button variant="ghost" size="icon-sm" aria-label="Close day" onClick={onClose}>
          <X />
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing was spent on this day.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payee</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="text-right">Spent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.subTransactionId === null ? t.transactionId : `s${t.subTransactionId}`}>
                <TableCell>
                  <Link
                    to="/budgets/$budgetId/accounts/$accountId"
                    params={{ budgetId: String(budgetId), accountId: String(t.accountId) }}
                    search={{ cleared: "all", sort: "date", dir: "asc", txn: t.transactionId }}
                    title="Open in its account's register"
                    className="hover:underline"
                  >
                    {t.payeeName ?? "No payee"}
                  </Link>
                </TableCell>
                <TableCell>{t.category}</TableCell>
                <TableCell className="text-muted-foreground">{t.accountName}</TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">{t.memo}</TableCell>
                <TableCell className={cn("text-right tabular-nums", t.spent < 0 && "text-success")}>
                  {formatCurrency(t.spent)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(data?.total ?? 0)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </section>
  );
}

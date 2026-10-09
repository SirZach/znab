import { Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { cn, formatCurrency, formatDateShort } from "@/lib/utils";
import { SectionHeading } from "@/components/common/section-heading";

/**
 * Every transaction behind this month's Spent, split parts included, read off
 * the same rows the budget engine totals, so the total here is the Spent figure
 * above to the cent. Each one opens its account's register on that transaction
 * (on the whole split, for a part of one), with the register's filters cleared
 * so the row is there to be found.
 */
export function SpentSection({
  budgetId,
  categoryId,
  month,
}: {
  budgetId: number;
  categoryId: number;
  month: string;
}) {
  const { data } = trpc.budget.categoryTransactions.useQuery({ budgetId, categoryId, month });

  return (
    <section className="my-2 py-2 border-y border-border/50 bg-muted/30">
      <div className="flex items-baseline justify-between gap-2 px-4 mb-2">
        <SectionHeading>Transactions</SectionHeading>
        {data && (
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(data.total)}</span>
        )}
      </div>

      {!data && <p className="px-4 text-xs text-muted-foreground">Loading...</p>}
      {data?.transactions.length === 0 && (
        <p className="px-4 text-xs text-muted-foreground">Nothing spent here this month.</p>
      )}

      <ul>
        {data?.transactions.map((t) => (
          <li key={t.subTransactionId === null ? t.transactionId : `s${t.subTransactionId}`}>
            <Link
              to="/budgets/$budgetId/accounts/$accountId"
              params={{ budgetId: String(budgetId), accountId: String(t.accountId) }}
              search={{ cleared: "all", sort: "date", dir: "asc", txn: t.transactionId }}
              title="Open in its account's register"
              className="block px-4 py-1.5 hover:bg-accent transition-colors"
            >
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{t.payeeName ?? "No payee"}</span>
                <span className={cn("shrink-0 tabular-nums", t.amount > 0 && "text-success")}>
                  {formatCurrency(t.amount)}
                </span>
              </span>
              <span className="flex gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0 tabular-nums">{formatDateShort(t.date)}</span>
                <span className="truncate">
                  {t.accountName}
                  {t.memo ? `, ${t.memo}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

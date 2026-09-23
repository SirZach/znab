import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { RegisterSort, SortDirection } from "@znab/shared";
import { ClearedFilter, type ClearedFilterValue } from "@/components/register/cleared-filter";
import { RegisterSearch } from "@/components/register/register-search";
import { SortHeader } from "@/components/register/sort-header";
import { trpc } from "@/trpc";
import { cn, formatCurrency, formatDateShort } from "@/lib/utils";

export const Route = createFileRoute("/budgets/$budgetId/accounts/all")({
  component: AllAccountsRegister,
});

const PAGE = 200;

/**
 * Every account's transactions in one register.
 *
 * This is the screen for finding something, which is the thing 27 separate
 * registers cannot do: searching one of them reaches one account, and a payee
 * paid from three cards is three searches. Changing a transaction stays in the
 * account's own register, where the add row, reconciling and the transfer
 * rules all live, so a row here opens that register rather than an editor of
 * its own. Two registers that can both write would be two to keep in step.
 */
function AllAccountsRegister() {
  const { budgetId } = Route.useParams();
  const navigate = useNavigate();
  const id = Number(budgetId);

  const [q, setQ] = useState("");
  const [cleared, setCleared] = useState<ClearedFilterValue>("all");
  const [sort, setSort] = useState<RegisterSort>("date");
  const [dir, setDir] = useState<SortDirection>("asc");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = trpc.account.transactions.useQuery({
    budgetId: id,
    cleared,
    q: q || undefined,
    sort,
    dir,
    limit: PAGE,
    offset,
  });

  const rows = data?.transactions ?? [];

  function sortBy(column: RegisterSort) {
    setOffset(0);
    if (column === sort) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(column);
      setDir(column === "date" ? "asc" : "desc");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-xl font-semibold">All Accounts</h2>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString()} transactions` : "Loading…"}
          {data ? ` · ${formatCurrency(data.balance)} across every account` : ""}
        </p>
      </div>

      <div className="px-6 py-2 border-b border-border flex flex-wrap items-center gap-3">
        <RegisterSearch
          value={q}
          matches={q ? data?.matches ?? 0 : null}
          total={data?.total ?? 0}
          onSearch={(next) => {
            setOffset(0);
            setQ(next);
          }}
        />
        <ClearedFilter
          value={cleared}
          counts={
            data?.counts ?? { all: 0, Uncleared: 0, Cleared: 0, Reconciled: 0 }
          }
          onChange={(next) => {
            setOffset(0);
            setCleared(next);
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[9%]" />
            <col className="w-[14%]" />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead className="sticky top-0 bg-background">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <SortHeader column="date" label="Date" sort={sort} dir={dir} onSort={sortBy} />
              <th className="text-left px-2 py-2 font-semibold">Account</th>
              <SortHeader column="payee" label="Payee" sort={sort} dir={dir} onSort={sortBy} />
              <SortHeader column="category" label="Category" sort={sort} dir={dir} onSort={sortBy} />
              <th className="text-left px-2 py-2 font-semibold">Memo</th>
              <SortHeader
                column="amount"
                label="Outflow"
                sort={sort}
                dir={dir}
                align="right"
                onSort={sortBy}
              />
              <th className="text-right px-2 py-2 font-semibold">Inflow</th>
              <th className="text-right px-2 py-2 font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                  {q ? `Nothing matches "${q}".` : "No transactions yet."}
                </td>
              </tr>
            )}
            {rows.map((txn) => (
              <tr
                key={txn.id}
                title="Open this account's register"
                onClick={() =>
                  navigate({
                    to: "/budgets/$budgetId/accounts/$accountId",
                    params: { budgetId, accountId: String(txn.accountId) },
                  })
                }
                className="border-b border-border hover:bg-accent/40 cursor-pointer"
              >
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                  {formatDateShort(txn.date)}
                </td>
                <td className="px-2 py-1.5 truncate text-muted-foreground">
                  {txn.account?.name ?? ""}
                </td>
                <td className="px-2 py-1.5 truncate">
                  <span className="flex items-center gap-1.5">
                    {txn.isTransfer && (
                      <ArrowLeftRight size={12} className="shrink-0 opacity-60" aria-label="Transfer" />
                    )}
                    <span className="truncate">{txn.payee?.name ?? "No payee"}</span>
                  </span>
                </td>
                <td className="px-2 py-1.5 truncate text-muted-foreground">
                  {txn.isSplit ? "Split" : txn.category?.name ?? ""}
                </td>
                <td className="px-2 py-1.5 truncate text-muted-foreground">{txn.memo ?? ""}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {Number(txn.amount) < 0 ? formatCurrency(Math.abs(Number(txn.amount))) : ""}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {Number(txn.amount) > 0 ? formatCurrency(Number(txn.amount)) : ""}
                </td>
                <td
                  className={cn(
                    "px-2 py-1.5 text-right tabular-nums",
                    txn.runningBalance < 0 && "text-destructive"
                  )}
                >
                  {formatCurrency(txn.runningBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {rows.length > 0
            ? `Showing ${offset + 1} to ${offset + rows.length} of ${(q || cleared !== "all"
                ? data?.matches ?? 0
                : data?.total ?? 0
              ).toLocaleString()}`
            : ""}
        </span>
        <span className="flex gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            className="rounded px-2 py-1 hover:bg-accent disabled:opacity-40"
          >
            Newer
          </button>
          <button
            disabled={rows.length < PAGE}
            onClick={() => setOffset(offset + PAGE)}
            className="rounded px-2 py-1 hover:bg-accent disabled:opacity-40"
          >
            Older
          </button>
        </span>
      </div>
    </div>
  );
}

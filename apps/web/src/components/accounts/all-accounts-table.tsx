import { ArrowLeftRight } from "lucide-react";
import type { RegisterSort, SortDirection } from "@znab/shared";
import { SortHeader } from "@/components/register/sort-header";
import { cn, formatCurrency, formatDateShort } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc";

type AllAccountsRow = inferRouterOutputs<AppRouter>["account"]["transactions"]["transactions"][number];

/**
 * Every account's rows, read only. A row opens its account's register, where
 * the add row, reconciling and the transfer rules live.
 */
export function AllAccountsTable({
  rows,
  isLoading,
  q,
  sort,
  dir,
  onSort,
  onOpen,
}: {
  rows: AllAccountsRow[];
  isLoading: boolean;
  q: string | undefined;
  sort: RegisterSort;
  dir: SortDirection;
  onSort: (column: RegisterSort, dir: SortDirection) => void;
  onOpen: (accountId: number) => void;
}) {
  return (
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
          <SortHeader column="date" label="Date" sort={sort} dir={dir} onSort={onSort} />
          <th className="text-left px-2 py-2 font-semibold">Account</th>
          <SortHeader column="payee" label="Payee" sort={sort} dir={dir} onSort={onSort} />
          <SortHeader column="category" label="Category" sort={sort} dir={dir} onSort={onSort} />
          <th className="text-left px-2 py-2 font-semibold">Memo</th>
          <SortHeader
            column="amount"
            label="Outflow"
            sort={sort}
            dir={dir}
            align="right"
            onSort={onSort}
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
            onClick={() => onOpen(txn.accountId)}
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
  );
}

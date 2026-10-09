import { createFileRoute } from "@tanstack/react-router";
import { allAccountsSearchSchema, type RegisterSort, type SortDirection } from "@znab/shared";
import { AllAccountsTable } from "@/components/accounts/all-accounts-table";
import { PageHeader } from "@/components/common/page-header";
import { ClearedFilter } from "@/components/register/cleared-filter";
import { RegisterSearch } from "@/components/register/register-search";
import { trpc } from "@/trpc";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/budgets/$budgetId/accounts/all")({
  // In the URL, so a filtered view can be linked to and survives a reload.
  validateSearch: allAccountsSearchSchema,
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
  const { q, cleared, sort, dir, offset } = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data, isLoading } = trpc.account.transactions.useQuery({
    budgetId: Number(budgetId),
    cleared,
    q: q || undefined,
    sort,
    dir,
    limit: PAGE,
    offset,
  });

  const rows = data?.transactions ?? [];

  // Any change but paging starts again from the first page.
  function sortBy(column: RegisterSort, nextDir: SortDirection) {
    navigate({ search: (prev) => ({ ...prev, sort: column, dir: nextDir, offset: 0 }) });
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="All Accounts"
        subtitle={
          <>
            {data ? `${data.total.toLocaleString()} transactions` : "Loading…"}
            {data ? ` · ${formatCurrency(data.balance)} across every account` : ""}
          </>
        }
      />

      <div className="px-6 py-2 border-b border-border flex flex-wrap items-center gap-3">
        <RegisterSearch
          value={q ?? ""}
          matches={q ? data?.matches ?? 0 : null}
          total={data?.total ?? 0}
          onSearch={(next) =>
            navigate({ search: (prev) => ({ ...prev, q: next || undefined, offset: 0 }) })
          }
        />
        <ClearedFilter
          value={cleared}
          counts={data?.counts ?? { all: 0, Uncleared: 0, Cleared: 0, Reconciled: 0 }}
          onChange={(next) => navigate({ search: (prev) => ({ ...prev, cleared: next, offset: 0 }) })}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <AllAccountsTable
          rows={rows}
          isLoading={isLoading}
          q={q}
          sort={sort}
          dir={dir}
          onSort={sortBy}
          onOpen={(accountId) =>
            navigate({
              to: "/budgets/$budgetId/accounts/$accountId",
              params: { budgetId, accountId: String(accountId) },
            })
          }
        />
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
            type="button"
            disabled={offset === 0}
            onClick={() =>
              navigate({ search: (prev) => ({ ...prev, offset: Math.max(0, offset - PAGE) }) })
            }
            className="rounded px-2 py-1 hover:bg-accent disabled:opacity-40"
          >
            Newer
          </button>
          <button
            type="button"
            disabled={rows.length < PAGE}
            onClick={() => navigate({ search: (prev) => ({ ...prev, offset: offset + PAGE }) })}
            className="rounded px-2 py-1 hover:bg-accent disabled:opacity-40"
          >
            Older
          </button>
        </span>
      </div>
    </div>
  );
}

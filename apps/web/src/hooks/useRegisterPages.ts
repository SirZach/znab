import { useState } from "react";
import type { RegisterSort, SortDirection } from "@znab/shared";
import { trpc } from "@/trpc";
import { focusOffset } from "@/lib/register-row";

/** How many transactions the register loads at a time, newest first. */
const PAGE_SIZE = 200;

export type RegisterClearedFilter = "all" | "Uncleared" | "Cleared" | "Reconciled";

/** One row of the register, read back off the hook rather than off the router. */
export type RegisterTransaction = ReturnType<typeof useRegisterPages>["transactions"][number];

/**
 * The register's rows, a page at a time. The window stays anchored to the
 * newest transaction, so recent activity is always on screen. Each page is its
 * own request rather than one request growing to cover them all, since the API
 * serves at most 1,000 rows at once and the largest account holds eight times
 * that.
 */
export function useRegisterPages({
  budgetId,
  accountId,
  cleared,
  q,
  sort,
  dir,
  focusId,
}: {
  budgetId: number;
  accountId: number;
  cleared: RegisterClearedFilter;
  q: string | undefined;
  sort: RegisterSort;
  dir: SortDirection;
  /** A transaction linked to from elsewhere, for the register to open on. */
  focusId?: number;
}) {
  // Back to one page whenever the register being viewed changes. Adjusted
  // during render rather than in an effect, so the new view never fetches with
  // the old view's page count.
  const viewKey = JSON.stringify([accountId, cleared, q, sort, dir, focusId]);
  const [paging, setPaging] = useState({ key: viewKey, count: 1 });
  if (paging.key !== viewKey) setPaging({ key: viewKey, count: 1 });
  const pageCount = paging.key === viewKey ? paging.count : 1;

  // A row linked to from elsewhere may be thousands of rows back, so the
  // register opens on a page around it rather than on the newest one, and
  // "Show older" carries on back from there.
  const { data: focus, isLoading: isLoadingFocus } = trpc.account.transactionPosition.useQuery(
    { budgetId, accountId, transactionId: focusId ?? 0 },
    { enabled: focusId !== undefined }
  );
  const offset = focus ? focusOffset(focus.position, PAGE_SIZE) : 0;

  const pages = trpc.useQueries((t) =>
    Array.from({ length: pageCount }, (_, i) =>
      t.account.transactions(
        {
          budgetId,
          accountId,
          cleared,
          q,
          sort,
          dir,
          limit: PAGE_SIZE,
          offset: offset + i * PAGE_SIZE,
        },
        // Held until the linked row's position is known, rather than loading
        // the newest page only to throw it away.
        { enabled: !isLoadingFocus }
      )
    )
  );
  // The balances and counts are the same on every page, so the first carries
  // them; whether anything is older is the last page's to say.
  const data = pages[0]?.data;
  const isLoading = pages[0]?.isLoading ?? true;

  // The date order comes back as the newest rows of each page turned round, so
  // each older page goes above the one before it; any other sort reads down.
  const loaded = pages.map((p) => p.data?.transactions ?? []);
  const transactions = (sort === "date" && dir === "asc" ? loaded.reverse() : loaded).flat();

  return {
    transactions,
    balance: data?.balance ?? 0,
    // The two halves of that working balance: what the bank has agreed to, and
    // what it has not seen yet. Reconciling works against the cleared one.
    clearedBalance: data?.clearedBalance ?? 0,
    unclearedBalance: data?.unclearedBalance ?? 0,
    total: data?.total ?? 0,
    /** How many rows each choice of the cleared filter would show. */
    counts: data?.counts ?? { all: 0, Uncleared: 0, Cleared: 0, Reconciled: 0 },
    /** How many rows the cleared filter and the search leave between them. */
    matches: data?.matches ?? 0,
    hasMore: pages.at(-1)?.data?.hasMore ?? false,
    /** Newer rows left off the bottom, when the register opened on an old one. */
    hasNewer: offset > 0,
    loadOlder: () =>
      setPaging((prev) => ({ key: viewKey, count: (prev.key === viewKey ? prev.count : 1) + 1 })),
    isLoading: isLoading || isLoadingFocus,
    isLoadingMore: pages.some((p) => p.isFetching) && !isLoading,
  };
}

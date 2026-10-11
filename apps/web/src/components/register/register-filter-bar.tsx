import { ClearedFilter } from "@/components/register/cleared-filter";
import { RegisterSearch } from "@/components/register/register-search";
import type { RegisterClearedFilter } from "@/hooks/useRegisterPages";

type Counts = Record<RegisterClearedFilter, number>;

/**
 * Which rows to show. It writes to the URL rather than to state, so a filtered
 * register is a link, and reloading keeps what was chosen.
 */
export function RegisterFilterBar({
  accountId,
  cleared,
  q,
  counts,
  matches,
  onClearedChange,
  onSearch,
}: {
  /** The search box is keyed on it, see below. */
  accountId: string;
  cleared: RegisterClearedFilter;
  q: string | undefined;
  counts: Counts;
  matches: number;
  onClearedChange: (next: RegisterClearedFilter) => void;
  onSearch: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-2 border-b border-border">
      <ClearedFilter value={cleared} counts={counts} onChange={onClearedChange} />
      <RegisterSearch
        // The route stays mounted across accounts, so a fresh box per account
        // drops the last account's text and its pending search.
        key={accountId}
        value={q ?? ""}
        matches={q ? matches : null}
        total={counts.all}
        onSearch={onSearch}
      />
      {cleared !== "all" && !q && (
        <span className="text-xs text-muted-foreground">
          Showing {counts[cleared]} of {counts.all}. The balances above are the whole account
          either way.
        </span>
      )}
    </div>
  );
}

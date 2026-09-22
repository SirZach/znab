import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Long enough that typing a word is one request, short enough to feel live. */
const SETTLE_MS = 250;

/**
 * Find a transaction by anything on it: who it was paid to, what it was filed
 * under, the note on it, or the amount.
 *
 * The text is held here and sent on once typing settles, because the query it
 * drives reads a whole account and firing one per keystroke would ask for the
 * register five times over on the way to a single word. What is sent goes to
 * the URL rather than to state, so a search is a link and survives a reload,
 * the same as the cleared filter beside it.
 */
export function RegisterSearch({
  value,
  matches,
  total,
  onSearch,
}: {
  value: string;
  /** How many rows the search leaves, or null when nothing is being searched. */
  matches: number | null;
  total: number;
  onSearch: (q: string) => void;
}) {
  const [text, setText] = useState(value);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);

  function change(next: string) {
    setText(next);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => onSearch(next), SETTLE_MS);
  }

  function clear() {
    clearTimeout(settle.current);
    setText("");
    onSearch("");
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          aria-label="Search this account"
          placeholder="Search payee, category, memo, amount"
          value={text}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends it now rather than waiting out the settle, and Escape
            // empties the field, which is the quickest way back to the register.
            if (e.key === "Enter") {
              clearTimeout(settle.current);
              onSearch(text);
            }
            if (e.key === "Escape") clear();
          }}
          className={cn(
            "h-7 w-72 rounded border border-border bg-transparent pl-7 pr-7 text-xs",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          )}
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {matches !== null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {matches === 0 ? "Nothing matches" : `${matches} of ${total}`}
        </span>
      )}
    </div>
  );
}

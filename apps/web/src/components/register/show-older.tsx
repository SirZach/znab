import { ActionButton } from "@/components/common/action-button";

/** The band above the rows that loads the next page back. */
export function ShowOlder({
  onLoadOlder,
  isLoadingMore,
  shown,
  total,
}: {
  onLoadOlder: () => void;
  isLoadingMore: boolean;
  shown: number;
  total: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-3 border-b border-border/50">
      <ActionButton
        variant="outline"
        className="text-xs px-3"
        onClick={onLoadOlder}
        disabled={isLoadingMore}
      >
        {isLoadingMore ? "Loading…" : "Show older transactions"}
      </ActionButton>
      <span className="text-xs text-muted-foreground tabular-nums">
        Showing the most recent {shown} of {total}
      </span>
    </div>
  );
}

import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Up and down, each dead when there is no neighbour that way. The neighbour is
 * handed back rather than named, since different rows swap against different
 * orders.
 */
export function ReorderArrows<T extends { id: number }>({
  label,
  up,
  down,
  onMove,
  disabled,
}: {
  label: string;
  up?: T;
  down?: T;
  onMove: (neighbour: T) => void;
  disabled: boolean;
}) {
  return (
    <span className="flex gap-1 text-muted-foreground">
      <button
        type="button"
        disabled={!up || disabled}
        onClick={() => up && onMove(up)}
        aria-label={`Move ${label} up`}
        className="rounded p-0.5 hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        disabled={!down || disabled}
        onClick={() => down && onMove(down)}
        aria-label={`Move ${label} down`}
        className="rounded p-0.5 hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronDown size={14} />
      </button>
    </span>
  );
}

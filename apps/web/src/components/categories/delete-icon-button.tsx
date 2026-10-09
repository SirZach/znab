import { Trash2 } from "lucide-react";

/** The small trash can at the end of a row, for a delete that confirms first. */
export function DeleteIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Delete ${label}`}
      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
    >
      <Trash2 size={13} />
    </button>
  );
}

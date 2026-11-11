import { CheckCircle2, Circle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The C column, which ticks a row off and unticks it again. Reconciled is not
 * part of that: a row gets there by being reconciled against a statement, so a
 * reconciled row shows its lock and stays put however often it is clicked.
 */
export function ClearedCell({ cleared, onCycle }: { cleared: string; onCycle: () => void }) {
  const locked = cleared === "Reconciled";

  return (
    // The whole cell takes the click, not just the 14px icon; the button inside
    // stays for the keyboard, and its click bubbles up here.
    <td
      className={cn("group px-2 py-2 text-center", locked ? "cursor-default" : "cursor-pointer")}
      onClick={(e) => {
        e.stopPropagation();
        onCycle();
      }}
    >
      <button
        type="button"
        className={cn(
          "transition-colors",
          locked ? "cursor-default" : "text-muted-foreground group-hover:text-foreground"
        )}
        title={locked ? "Reconciled against a statement" : cleared}
      >
        {cleared === "Reconciled" ? (
          <Lock size={14} className="text-primary" />
        ) : cleared === "Cleared" ? (
          <CheckCircle2 size={14} className="text-green-500" />
        ) : (
          <Circle size={14} />
        )}
      </button>
    </td>
  );
}

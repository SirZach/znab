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
    <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onCycle}
        className={cn(
          "transition-colors",
          locked ? "cursor-default" : "text-muted-foreground hover:text-foreground"
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

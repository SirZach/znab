import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * One of the two +/- buttons on a Budgeted cell, and the small popup it opens.
 * The popup reads a plain magnitude, never a signed one: the button pressed is
 * what decides whether it is added or subtracted, so `onApply` gets the raw
 * text and leaves the sign to the caller.
 */
export function AdjustButton({
  op,
  open,
  onOpenChange,
  onApply,
}: {
  op: "+" | "-";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (typed: string) => void;
}) {
  const [typed, setTyped] = useState("");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setTyped("");
      }}
    >
      <PopoverTrigger
        tabIndex={-1}
        aria-label={op === "+" ? "Add to budgeted amount" : "Subtract from budgeted amount"}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        {op === "+" ? <Plus size={12} /> : <Minus size={12} />}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2"
        align="center"
        // Portalled out of the row in the DOM, but a React event still travels
        // the tree it was rendered in, so without this a click in here would
        // reach the row underneath and change what is selected.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // This popup sits over a cell with its own Enter/Escape handling.
          // Its keystrokes are for the amount being typed here, not the cell.
          e.stopPropagation();
          if (e.key === "Enter") {
            onApply(typed);
          } else if (e.key === "Escape") {
            onOpenChange(false);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-center">
            {op === "+" ? "Amount to Add" : "Amount to Subtract"}
          </span>
          <div className="flex items-center justify-end gap-1">
            {/* Which of the two buttons was pressed, said again where the amount
                is being typed, since the button itself is now behind a popup. */}
            <span aria-hidden className="text-muted-foreground">
              {op}
            </span>
            <input
              type="text"
              inputMode="decimal"
              aria-label={op === "+" ? "Amount to add" : "Amount to subtract"}
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-20 text-right bg-transparent focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 tabular-nums"
            />
          </div>
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground"
              onClick={() => {
                onOpenChange(false);
                setTyped("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" className="h-7" onClick={() => onApply(typed)}>
              {op === "+" ? "Add" : "Subtract"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

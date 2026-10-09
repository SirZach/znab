import { useState } from "react";
import { X } from "lucide-react";
import { FLAG_COLORS, type FlagColor } from "@znab/shared";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * What each flag looks like. YNAB 4 attaches no meaning to the six, so there is
 * nothing to show but the colour itself, and the names are spelled out in full
 * here rather than built up, because Tailwind only ships the classes it can read.
 */
const FLAG_CLASS: Record<FlagColor, string> = {
  Red: "bg-red-500",
  Orange: "bg-orange-500",
  Yellow: "bg-yellow-400",
  Green: "bg-green-500",
  Blue: "bg-blue-500",
  Purple: "bg-purple-500",
};

/**
 * The flag column, which YNAB 4 puts ahead of the date. It is the same control
 * on a row being read as on one being typed, so the caller decides what picking
 * a colour means: a patch to the draft on the add and edit rows, a write of its
 * own on a row already on the books. The cell swallows the click either way,
 * since the row behind it opens for editing when clicked.
 */
export function FlagCell({
  value,
  onSelect,
  tabIndex,
}: {
  value: FlagColor | null;
  onSelect: (flagColor: FlagColor | null) => void;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);

  function choose(flagColor: FlagColor | null) {
    setOpen(false);
    onSelect(flagColor);
  }

  return (
    <td className="pl-2 py-2" onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          tabIndex={tabIndex}
          aria-label={value ? `Flagged ${value}` : "Not flagged"}
          title={value ?? "No flag"}
          className={cn(
            "size-3 rounded-sm transition-colors",
            value ? FLAG_CLASS[value] : "border border-border hover:bg-accent"
          )}
        />
        <PopoverContent className="w-auto p-1.5" align="start">
          <div className="flex items-center gap-1.5">
            {FLAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => choose(color)}
                aria-label={color}
                title={color}
                className={cn("size-4 rounded-sm", FLAG_CLASS[color])}
              />
            ))}
            <button
              type="button"
              onClick={() => choose(null)}
              aria-label="No flag"
              title="No flag"
              className="size-4 rounded-sm border border-border flex items-center justify-center text-muted-foreground hover:bg-accent"
            >
              <X size={10} />
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </td>
  );
}

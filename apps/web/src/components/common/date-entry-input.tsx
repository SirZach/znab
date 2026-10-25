import { type ComponentProps, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UnderlineInput } from "@/components/common/underline-input";
import { offsetDays, parseDateEntry } from "@/lib/date-entry";
import { cn, formatDateShort } from "@/lib/utils";

/**
 * A date typed the way a register takes one (see `parseDateEntry`), with the
 * arrow keys stepping a day and a calendar beside it for picking instead.
 * `onKeyDown` sees every key the arrows leave alone.
 */
export function DateEntryInput({
  value,
  onChange,
  onKeyDown,
  className,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: Date | undefined;
  /** Undefined only when the calendar's selected day is clicked again. */
  onChange: (date: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  // What is in the field while it is being typed into. Null means nothing is
  // being typed, so the field shows the date it actually holds.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-0.5">
      <UnderlineInput
        type="text"
        className={cn("tabular-nums", className)}
        {...props}
        // The date held, unless somebody is part way through typing another
        // one, in which case theirs stands untouched.
        value={draft ?? (value ? formatDateShort(value) : "")}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseDateEntry(e.target.value);
          if (parsed) onChange(parsed);
        }}
        // Whatever was typed is dropped on the way out and the field falls
        // back to the date that was understood, so half a date never sticks.
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          // A day either side is the commonest correction there is, and the
          // arrows are otherwise doing nothing in a text field.
          if ((e.key === "ArrowUp" || e.key === "ArrowDown") && value) {
            e.preventDefault();
            setDraft(null);
            onChange(offsetDays(value, e.key === "ArrowUp" ? 1 : -1));
            return;
          }
          if (e.key === "Enter") setDraft(null);
          onKeyDown?.(e);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              tabIndex={-1}
              variant="ghost"
              aria-label="Pick a date from a calendar"
              className="h-auto shrink-0 px-1 py-0.5"
            />
          }
        >
          <CalendarIcon className="h-3.5 w-3.5 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => {
              setDraft(null);
              onChange(date);
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

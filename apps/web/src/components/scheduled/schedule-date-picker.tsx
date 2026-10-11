import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateShort } from "@/lib/utils";

/** Picks a schedule's next date. */
export function ScheduleDatePicker({
  date,
  onChange,
  className,
}: {
  date: Date;
  onChange: (date: Date) => void;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn("justify-start text-sm font-normal h-auto py-1.5 px-2", className)}
          />
        }
      >
        <CalendarIcon className="mr-2 h-3.5 w-3.5 opacity-50" />
        {formatDateShort(date)}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          // Clicking the selected day deselects it, and a schedule has to be
          // dated, so that is ignored.
          onSelect={(next) => next && onChange(next)}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

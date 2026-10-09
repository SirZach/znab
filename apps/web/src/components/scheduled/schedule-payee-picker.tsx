import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** A payee as the picker needs it. */
export type PickablePayee = { id: number; name: string };

/**
 * Picks a payee, or takes a typed name for one the API makes on the way in.
 * Typing clears the picked id.
 */
export function SchedulePayeePicker({
  payees,
  payeeId,
  payeeName,
  onChange,
  className,
}: {
  payees: PickablePayee[] | undefined;
  payeeId: number | null;
  payeeName: string;
  onChange: (patch: { payeeId: number | null; payeeName: string }) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const label = payeeId ? payees?.find((p) => p.id === payeeId)?.name : payeeName;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            className={cn(
              "justify-start text-left text-sm font-normal h-auto py-1.5 px-2",
              className
            )}
          />
        }
      >
        {label || <span className="text-muted-foreground">Payee</span>}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search payees..."
            value={payeeName}
            onValueChange={(val) => onChange({ payeeName: val, payeeId: null })}
          />
          <CommandList>
            <CommandEmpty>{payeeName ? `Add "${payeeName}"` : "No payees found."}</CommandEmpty>
            <CommandGroup>
              {payees?.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    onChange({ payeeId: p.id, payeeName: p.name });
                    setOpen(false);
                  }}
                >
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

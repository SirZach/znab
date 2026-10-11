import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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
import { toggleFilterId } from "@/lib/report-filters";
import { cn } from "@/lib/utils";

export type FilterOptionGroup = { heading: string; options: { id: number; label: string }[] };

/**
 * Picks some of a report's accounts or categories. `selected` undefined means
 * all of them, which is what the trigger says rather than counting them.
 */
export function FilterPicker({
  noun,
  groups,
  selected,
  onChange,
}: {
  /** Plural, lower case: "accounts", "categories". */
  noun: string;
  groups: FilterOptionGroup[];
  selected: number[] | undefined;
  onChange: (selected: number[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = groups.flatMap((g) => g.options);
  const allIds = options.map((o) => o.id);
  const isTicked = (id: number) => !selected || selected.includes(id);

  const summary = !selected
    ? `All ${noun}`
    : selected.length === 1
      ? (options.find((o) => o.id === selected[0])?.label ?? `1 of ${noun}`)
      : `${selected.length} ${noun}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" role="combobox" className="max-w-56 font-normal" />}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${noun}...`} />
          <CommandList>
            <CommandEmpty>No {noun} found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value={`all ${noun}`} onSelect={() => onChange(undefined)}>
                <Check className={cn(selected && "invisible")} />
                All {noun}
              </CommandItem>
            </CommandGroup>
            {groups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={`${group.heading} ${option.label} ${option.id}`}
                    onSelect={() => onChange(toggleFilterId(selected, option.id, allIds))}
                  >
                    <Check className={cn(!isTicked(option.id) && "invisible")} />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

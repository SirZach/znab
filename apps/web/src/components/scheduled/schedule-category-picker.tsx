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
import type { CategoryOption } from "@/lib/category-options";
import { cn } from "@/lib/utils";

/** Picks the category a schedule files its money under. */
export function ScheduleCategoryPicker({
  options,
  categoryId,
  onChange,
  className,
}: {
  options: CategoryOption[];
  categoryId: number | null;
  onChange: (categoryId: number) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

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
        {categoryId ? (
          options.find((c) => c.id === categoryId)?.label
        ) : (
          <span className="text-muted-foreground">Category</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList>
            <CommandEmpty>No categories found.</CommandEmpty>
            <CommandGroup>
              {options.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.label}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  {c.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

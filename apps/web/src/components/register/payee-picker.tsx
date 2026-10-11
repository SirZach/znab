import { useState } from "react";
import { Plus } from "lucide-react";
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

type Payee = { id: number; name: string };

// The create choice's value in the list, which no payee name can collide with.
const CREATE = "\u0000create";

/**
 * The register's payee picker. What is typed is a search, never a payee: it
 * only reaches the row as an existing payee or, through the create choice in
 * the list, a new one somebody asked for by name.
 *
 * Leaving the picker with a search in it takes the closest payee rather than
 * the text, since a half typed name is almost always one already in use. Tab
 * with nothing matching stays put on the create choice, so a new payee is only
 * ever made by picking it. Escape throws the search away.
 */
export function PayeePicker<P extends Payee>({
  payees,
  payeeId,
  payeeName,
  onPick,
  onCreate,
  triggerRef,
  tabIndex,
}: {
  payees: P[] | undefined;
  payeeId: number | null;
  payeeName: string;
  onPick: (payee: P) => void;
  onCreate: (name: string) => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The highlighted choice, which is the closest match while a search is typed.
  const [highlighted, setHighlighted] = useState("");

  const name = query.trim();
  const exists = payees?.some((p) => p.name.toLowerCase() === name.toLowerCase());
  const closest = name ? payees?.find((p) => p.name === highlighted) : undefined;

  function close() {
    setOpen(false);
    setQuery("");
  }

  function pick(payee: P) {
    close();
    onPick(payee);
  }

  function create() {
    close();
    onCreate(name);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next) return setOpen(true);
        if (closest && details.reason !== "escape-key") pick(closest);
        else close();
      }}
    >
      <PopoverTrigger
        // A letter typed at the closed picker opens it and starts the search,
        // so a payee is two keystrokes away rather than an Enter and then two.
        onKeyDown={(e) => {
          if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
          e.preventDefault();
          setQuery(e.key);
          setOpen(true);
        }}
        render={
          <Button
            ref={triggerRef}
            tabIndex={tabIndex}
            variant="ghost"
            role="combobox"
            className="w-full justify-start text-left text-sm font-normal h-auto py-0.5 px-1 text-foreground"
          />
        }
      >
        {payeeId
          ? payees?.find((p) => p.id === payeeId)?.name
          : payeeName || <span className="text-muted-foreground">Payee</span>}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command value={highlighted} onValueChange={setHighlighted}>
          <CommandInput
            placeholder="Search payees..."
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key !== "Tab" || !name) return;
              e.preventDefault();
              if (closest) pick(closest);
            }}
          />
          <CommandList>
            <CommandEmpty>No payees found.</CommandEmpty>
            <CommandGroup>
              {payees?.map((p) => (
                <CommandItem key={p.id} value={p.name} onSelect={() => pick(p)}>
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {name && !exists && (
              <CommandGroup forceMount>
                <CommandItem forceMount value={CREATE} onSelect={create}>
                  <Plus className="h-3.5 w-3.5 opacity-60" />
                  Create payee "{name}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

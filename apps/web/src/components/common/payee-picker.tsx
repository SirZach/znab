import { useRef, useState } from "react";
import { defaultFilter } from "cmdk";
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
import { cn } from "@/lib/utils";

type Payee = { id: number; name: string };

// The create choice's value in the list, which no payee name can collide with.
const CREATE = "\u0000create";

// Every transfer payee is named "Transfer : <account>", and with the account
// name pushed back past that prefix a search for it ranked below any payee
// that merely started the same way. Transfers are searched by account name.
const searchPayees: typeof defaultFilter = (value, search, keywords) =>
  defaultFilter(value.replace(/^Transfer : /, ""), search, keywords);

/**
 * The payee picker for the register and scheduled transactions. What is typed
 * is a search, never a payee: it only reaches the row as an existing payee or,
 * through the create choice in the list, a new one somebody asked for by name.
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
  variant = "ghost",
  className,
}: {
  payees: P[] | undefined;
  payeeId: number | null;
  payeeName: string;
  onPick: (payee: P) => void;
  onCreate: (name: string) => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
  tabIndex?: number;
  /** Ghost sits flush in a register row; outline matches a form's fields. */
  variant?: "ghost" | "outline";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const name = query.trim();
  const exists = payees?.some((p) => p.name.toLowerCase() === name.toLowerCase());

  // The highlighted payee, which is the closest match while a search is typed.
  // Found by id, since cmdk trims the names it keeps as values and imported
  // names can carry stray spaces.
  function closest() {
    if (!name) return undefined;
    const id = listRef.current?.querySelector<HTMLElement>("[cmdk-item][data-selected=true]")
      ?.dataset.payeeId;
    return payees?.find((p) => String(p.id) === id);
  }

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
        const payee = details.reason === "escape-key" ? undefined : closest();
        if (payee) pick(payee);
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
            variant={variant}
            role="combobox"
            className={cn(
              "w-full justify-start text-left text-sm font-normal h-auto text-foreground",
              variant === "ghost" ? "py-0.5 px-1" : "py-1.5 px-2",
              className
            )}
          />
        }
      >
        {payeeId
          ? payees?.find((p) => p.id === payeeId)?.name
          : payeeName || <span className="text-muted-foreground">Payee</span>}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command ref={listRef} filter={searchPayees}>
          <CommandInput
            placeholder="Search payees..."
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key !== "Tab" || !name) return;
              e.preventDefault();
              const payee = closest();
              if (payee) pick(payee);
            }}
          />
          <CommandList>
            <CommandEmpty>No payees found.</CommandEmpty>
            <CommandGroup>
              {payees?.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  data-payee-id={p.id}
                  onSelect={() => pick(p)}
                >
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

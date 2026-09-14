import { useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import type { PayeeAutofillPatch, PayeeAutofillSource } from "@/lib/payee-autofill";
import type { RegisterFields } from "@/lib/register-row";

/** A payee as the picker needs it: enough to list it and to autofill from it. */
type PickablePayee = PayeeAutofillSource & { id: number; name: string };

/**
 * The fields of a row that may not be changed where it is being edited, and
 * why. A locked field is shown as what it holds rather than as a dead control,
 * so nobody types into something the save would throw away.
 */
export type RegisterRowLocks = {
  payee?: string;
  category?: { label: string; reason: string };
  amount?: string;
};

const inputClass =
  "bg-transparent border-b border-border focus:outline-none focus:border-primary text-sm w-full px-1 py-0.5";

const lockedClass = "flex items-center gap-1.5 text-muted-foreground";

/**
 * The six editable cells of a register row: date, payee, category, memo,
 * outflow and inflow. Shared so the add row and the row being edited cannot
 * drift apart. The row itself, its two trailing cells and its draft belong to
 * the caller, which is what keeps the three stacked tables' columns lined up.
 */
export function RegisterRowFields({
  fields,
  onChange,
  payees,
  categoryOptions,
  autofill,
  locks = {},
  onSubmit,
  onCancel,
  tabIndexBase,
  autoFocus,
}: {
  fields: RegisterFields;
  /** Only the keys that changed; the caller merges them into its draft. */
  onChange: (patch: Partial<RegisterFields>) => void;
  payees: PickablePayee[] | undefined;
  categoryOptions: Array<{ id: number; label: string }>;
  autofill: (payee: PayeeAutofillSource, draft: RegisterFields) => PayeeAutofillPatch;
  locks?: RegisterRowLocks;
  onSubmit: () => void;
  onCancel?: () => void;
  /** First tab stop, for a row that sits ahead of the rest of the page. */
  tabIndexBase?: number;
  autoFocus?: boolean;
}) {
  const [payeeOpen, setPayeeOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);

  const tab = (n: number) => (tabIndexBase === undefined ? undefined : tabIndexBase + n);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") onSubmit();
    if (e.key === "Escape") onCancel?.();
  }

  return (
    <>
      <td className="px-6 py-2">
        <Popover>
          <PopoverTrigger
            render={
              <Button
                tabIndex={tab(0)}
                variant="ghost"
                className={cn(
                  "w-full justify-start text-left text-sm font-normal h-auto py-0.5 px-1",
                  !fields.date && "text-muted-foreground"
                )}
              />
            }
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 opacity-50" />
            {fields.date ? format(fields.date, "MM/dd/yyyy") : "Pick a date"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fields.date}
              onSelect={(date) => onChange({ date })}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </td>

      <td className="px-4 py-2">
        {locks.payee ? (
          <span title={locks.payee} className={lockedClass}>
            <Lock size={12} className="shrink-0" />
            {fields.payeeName || "—"}
          </span>
        ) : (
          <Popover open={payeeOpen} onOpenChange={setPayeeOpen}>
            <PopoverTrigger
              render={
                <Button
                  tabIndex={tab(1)}
                  variant="ghost"
                  role="combobox"
                  className="w-full justify-start text-left text-sm font-normal h-auto py-0.5 px-1 text-foreground"
                />
              }
            >
              {fields.payeeId
                ? payees?.find((p) => p.id === fields.payeeId)?.name
                : fields.payeeName || <span className="text-muted-foreground">Payee</span>}
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search payees..."
                  value={fields.payeeName}
                  onValueChange={(val) => onChange({ payeeName: val, payeeId: null })}
                />
                <CommandList>
                  <CommandEmpty>
                    {fields.payeeName ? `Add "${fields.payeeName}"` : "No payees found."}
                  </CommandEmpty>
                  <CommandGroup>
                    {payees?.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        onSelect={() => {
                          setPayeeOpen(false);

                          // YNAB 4 prefills the rest of the row from what this
                          // payee usually uses. Typing a brand new name skips
                          // this entirely, since there is nothing remembered yet.
                          const patch = autofill(p, fields);
                          onChange({ payeeId: p.id, payeeName: p.name, ...patch });

                          // Once the category is settled its picker is a stop the
                          // user does not need, and landing on it would pop the
                          // menu open over an answer they already have. A transfer
                          // has no picker to land on at all, so the memo catches
                          // whatever the category cannot.
                          const next =
                            patch.categoryId !== undefined ? memoRef : categoryTriggerRef;
                          setTimeout(() => (next.current ?? memoRef.current)?.focus(), 0);
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
        )}
      </td>

      <td className="px-4 py-2">
        {locks.category ? (
          <span title={locks.category.reason} className={lockedClass}>
            <Lock size={12} className="shrink-0" />
            {locks.category.label}
          </span>
        ) : (
          <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
            <PopoverTrigger
              render={
                <Button
                  ref={categoryTriggerRef}
                  tabIndex={tab(2)}
                  variant="ghost"
                  role="combobox"
                  onFocus={() => setCategoryOpen(true)}
                  className="w-full justify-start text-left text-sm font-normal h-auto py-0.5 px-1 text-foreground"
                />
              }
            >
              {fields.categoryId ? (
                categoryOptions.find((c) => c.id === fields.categoryId)?.label
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
                    {categoryOptions.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.label}
                        onSelect={() => {
                          onChange({ categoryId: c.id });
                          setCategoryOpen(false);
                          setTimeout(() => memoRef.current?.focus(), 0);
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
        )}
      </td>

      <td className="px-4 py-2">
        <input
          type="text"
          ref={memoRef}
          tabIndex={tab(3)}
          autoFocus={autoFocus}
          aria-label="Memo"
          placeholder="Memo"
          value={fields.memo}
          onChange={(e) => onChange({ memo: e.target.value })}
          onKeyDown={handleKeyDown}
          className={inputClass}
        />
      </td>

      {[
        { label: "Outflow", value: fields.outflow, set: (outflow: string) => onChange({ outflow }) },
        { label: "Inflow", value: fields.inflow, set: (inflow: string) => onChange({ inflow }) },
      ].map((column, i) => (
        <td key={column.label} className="px-4 py-2">
          {locks.amount ? (
            <p title={locks.amount} className="text-right text-muted-foreground tabular-nums">
              {column.value}
            </p>
          ) : (
            <input
              // Text rather than a number input: these take arithmetic like
              // `25+13`, the same as every other money field in the app.
              type="text"
              inputMode="decimal"
              tabIndex={tab(4 + i)}
              aria-label={column.label}
              placeholder="0.00"
              value={column.value}
              onChange={(e) => column.set(e.target.value)}
              onKeyDown={handleKeyDown}
              className={cn(inputClass, "text-right")}
            />
          )}
        </td>
      ))}
    </>
  );
}

import { useRef, useState } from "react";
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
import { formatDateShort } from "@/lib/utils";
import { MoneyInput } from "@/components/common/money-input";
import { UnderlineInput } from "@/components/common/underline-input";
import { FlagCell } from "@/components/register/flag-cell";
import { offsetDays, parseDateEntry } from "@/lib/date-entry";
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

const lockedClass = "flex items-center gap-1.5 text-muted-foreground";

/**
 * The editable cells of a register row: flag, date, check number, payee,
 * category, memo, outflow and inflow. Shared so the add row and the row being
 * edited cannot drift apart. The row itself, its two trailing cells and its draft belong to
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
  payeeTriggerRef,
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
  /**
   * The payee control, handed back so the register can return to it once a row
   * has saved. Entering a run of transactions is the same few keystrokes over
   * and over, and the one thing that stopped it being continuous was that the
   * add row let go of the keyboard the moment it was used.
   */
  payeeTriggerRef?: React.Ref<HTMLButtonElement>;
  /**
   * The number this account is up to, offered as the check field's placeholder
   * rather than typed into it: most rows are not cheques, and prefilling would
   * put a check number on every one of them.
   */
}) {
  const [payeeOpen, setPayeeOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const outflowRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [dateOpen, setDateOpen] = useState(false);
  // What is in the date field while it is being typed into. Null means nothing
  // is being typed, so the field shows the date the row actually holds.
  const [dateDraft, setDateDraft] = useState<string | null>(null);

  const tab = (n: number) => (tabIndexBase === undefined ? undefined : tabIndexBase + n);

  /**
   * Lets a picker be typed at rather than opened first. The trigger is a button,
   * so a letter would otherwise go nowhere and the reader would have to press
   * Enter to open the list before typing the name they already know. This makes
   * the first letter do both, which is the difference between four keystrokes
   * for a payee and two.
   */
  function openOnType(
    e: React.KeyboardEvent,
    open: () => void,
    seed?: (text: string) => void
  ) {
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    seed?.(e.key);
    open();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      setDateDraft(null);
      onSubmit();
    }
    if (e.key === "Escape") onCancel?.();
  }

  return (
    <>
      <FlagCell
        value={fields.flagColor}
        onSelect={(flagColor) => onChange({ flagColor })}
        tabIndex={tab(0)}
      />

      <td className="px-6 py-2">
        <div className="flex items-center gap-0.5">
          <UnderlineInput
            type="text"
            ref={dateRef}
            tabIndex={tab(1)}
            aria-label="Date"
            placeholder="Date"
            // The date the row holds, unless somebody is part way through
            // typing another one, in which case theirs stands untouched.
            value={dateDraft ?? (fields.date ? formatDateShort(fields.date) : "")}
            onChange={(e) => {
              setDateDraft(e.target.value);
              const parsed = parseDateEntry(e.target.value);
              if (parsed) onChange({ date: parsed });
            }}
            // Whatever was typed is dropped on the way out and the field falls
            // back to the date that was understood, so half a date never sticks.
            onBlur={() => setDateDraft(null)}
            onKeyDown={(e) => {
              // A day either side is the commonest correction there is, and
              // the arrows are otherwise doing nothing in a text field.
              if ((e.key === "ArrowUp" || e.key === "ArrowDown") && fields.date) {
                e.preventDefault();
                setDateDraft(null);
                onChange({ date: offsetDays(fields.date, e.key === "ArrowUp" ? 1 : -1) });
                return;
              }
              handleKeyDown(e);
            }}
            className="tabular-nums"
          />
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
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
                selected={fields.date}
                onSelect={(date) => {
                  setDateDraft(null);
                  onChange({ date });
                  setDateOpen(false);
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>
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
              onKeyDown={(e) =>
                openOnType(
                  e,
                  () => setPayeeOpen(true),
                  (text) => onChange({ payeeName: text, payeeId: null })
                )
              }
              render={
                <Button
                  ref={payeeTriggerRef}
                  tabIndex={tab(2)}
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
                          // menu open over an answer they already have. What is
                          // worth landing on is the amount: it is the one field
                          // that differs every time even for a payee used
                          // weekly, and selecting what autofill put there means
                          // typing replaces it and Enter accepts it.
                          const next =
                            patch.categoryId !== undefined ? outflowRef : categoryTriggerRef;
                          setTimeout(() => {
                            const el = next.current ?? memoRef.current;
                            el?.focus();
                            if (el === outflowRef.current) outflowRef.current?.select();
                          }, 0);
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
                  tabIndex={tab(3)}
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
        <UnderlineInput
          type="text"
          ref={memoRef}
          tabIndex={tab(4)}
          autoFocus={autoFocus}
          aria-label="Memo"
          placeholder="Memo"
          value={fields.memo}
          onChange={(e) => onChange({ memo: e.target.value })}
          onKeyDown={handleKeyDown}
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
            <MoneyInput
              variant="underline"
              ref={i === 0 ? outflowRef : undefined}
              tabIndex={tab(5 + i)}
              aria-label={column.label}
              value={column.value}
              onChange={(e) => column.set(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
        </td>
      ))}
    </>
  );
}

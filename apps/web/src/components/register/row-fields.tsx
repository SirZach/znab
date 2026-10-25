import { useRef, useState } from "react";
import { Lock } from "lucide-react";
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
import { MoneyInput } from "@/components/common/money-input";
import { UnderlineInput } from "@/components/common/underline-input";
import { FlagCell } from "@/components/register/flag-cell";
import { PayeePicker } from "@/components/common/payee-picker";
import { DateEntryInput } from "@/components/common/date-entry-input";
import type { PayeeAutofillPatch, PayeeAutofillSource } from "@/lib/payee-autofill";
import type { RegisterCategoryOption } from "@/lib/category-options";
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
  dateInputRef,
}: {
  fields: RegisterFields;
  /** Only the keys that changed; the caller merges them into its draft. */
  onChange: (patch: Partial<RegisterFields>) => void;
  payees: PickablePayee[] | undefined;
  categoryOptions: RegisterCategoryOption[];
  autofill: (payee: PayeeAutofillSource, draft: RegisterFields) => PayeeAutofillPatch;
  locks?: RegisterRowLocks;
  onSubmit: () => void;
  onCancel?: () => void;
  /** First tab stop, for a row that sits ahead of the rest of the page. */
  tabIndexBase?: number;
  autoFocus?: boolean;
  /**
   * The date field, handed back so the register can return to it once a row
   * has saved. Entering a run of transactions is the same few keystrokes over
   * and over, and the one thing that stopped it being continuous was that the
   * add row let go of the keyboard the moment it was used.
   */
  dateInputRef?: React.Ref<HTMLInputElement>;
  /**
   * The number this account is up to, offered as the check field's placeholder
   * rather than typed into it: most rows are not cheques, and prefilling would
   * put a check number on every one of them.
   */
}) {
  const [categoryOpen, setCategoryOpen] = useState(false);

  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);

  const tab = (n: number) => (tabIndexBase === undefined ? undefined : tabIndexBase + n);

  // The category picker, or the memo when the category is locked.
  function focusAfterPayee() {
    setTimeout(() => (categoryTriggerRef.current ?? memoRef.current)?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") onSubmit();
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
        <DateEntryInput
          ref={dateInputRef}
          tabIndex={tab(1)}
          aria-label="Date"
          placeholder="Date"
          value={fields.date}
          onChange={(date) => onChange({ date })}
          onKeyDown={handleKeyDown}
        />
      </td>

      <td className="px-4 py-2">
        {locks.payee ? (
          <span title={locks.payee} className={lockedClass}>
            <Lock size={12} className="shrink-0" />
            {fields.payeeName || "—"}
          </span>
        ) : (
          <PayeePicker
            payees={payees}
            payeeId={fields.payeeId}
            payeeName={fields.payeeName}
            tabIndex={tab(2)}
            onPick={(p) => {
              // YNAB 4 prefills the rest of the row from what this payee
              // usually uses. A brand new payee skips this entirely, since
              // there is nothing remembered yet.
              onChange({ payeeId: p.id, payeeName: p.name, ...autofill(p, fields) });

              // A payee can file under more than one category, so a remembered
              // one is only a suggestion: the picker opens on it, and Enter or
              // Tab confirms it.
              focusAfterPayee();
            }}
            onCreate={(name) => {
              onChange({ payeeId: null, payeeName: name });
              focusAfterPayee();
            }}
          />
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
              <Command
                // Opens on the category the row already holds, so confirming
                // it is a keystroke.
                defaultValue={categoryOptions.find((c) => c.id === fields.categoryId)?.label}
              >
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

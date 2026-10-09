import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { ACCOUNT_TYPES, type AccountType } from "@znab/shared";
import { ActionButton } from "@/components/common/action-button";
import { FieldInput } from "@/components/common/field-input";
import { FieldSelect } from "@/components/common/field-select";
import { LabeledField } from "@/components/common/labeled-field";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NewAccount } from "@/hooks/useAccounts";
import { accountTypeLabel, TRACKING_NOTE } from "@/lib/accounts";
import { formatDateISO, formatDateShort, parseAmountExpression } from "@/lib/utils";

/**
 * The starting balance is what the account holds today, and the API files it as
 * a transaction dated as chosen. The type and the date are left as they were
 * after each save, since several accounts are usually opened at once.
 */
export function NewAccountForm({
  onCreate,
  isCreating,
  error,
}: {
  onCreate: (account: NewAccount, onDone?: () => void) => void;
  isCreating: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("Checking");
  const [onBudget, setOnBudget] = useState(true);
  const [note, setNote] = useState("");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(() => new Date());

  const balanceText = balance.trim();
  const balanceValue = balanceText === "" ? null : parseAmountExpression(balanceText);
  const balanceInvalid = balanceText !== "" && balanceValue === null;
  const ready = name.trim() !== "" && !balanceInvalid && !isCreating;

  function submit() {
    onCreate(
      {
        name: name.trim(),
        accountType,
        onBudget,
        note: note.trim() || undefined,
        // A zero balance is no balance: it would only file a transaction that
        // says nothing.
        ...(balanceValue
          ? {
              startingBalance: balanceValue,
              startingBalanceDate: formatDateISO(date),
            }
          : {}),
      },
      () => {
        setName("");
        setNote("");
        setBalance("");
      }
    );
  }

  return (
    <div className="px-6 py-3 border-b border-border bg-accent/20">
      <div className="flex flex-wrap items-end gap-3">
        <LabeledField label="Name">
          <FieldInput
            type="text"
            placeholder="Checking"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) submit();
            }}
            className="w-48"
          />
        </LabeledField>

        <LabeledField label="Type">
          <FieldSelect
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AccountType)}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {accountTypeLabel(t)}
              </option>
            ))}
          </FieldSelect>
        </LabeledField>

        <LabeledField label="Budgeting">
          <FieldSelect
            value={onBudget ? "budget" : "tracking"}
            onChange={(e) => setOnBudget(e.target.value === "budget")}
          >
            <option value="budget">Budget account</option>
            <option value="tracking">Tracking account</option>
          </FieldSelect>
        </LabeledField>

        <LabeledField label="Note (optional)" className="min-w-40 flex-1">
          <FieldInput
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full"
          />
        </LabeledField>

        <LabeledField label="Balance today">
          <FieldInput
            // Text rather than a number input: these take arithmetic like
            // `25+13`, the same as every other money field in the app.
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="w-28 text-right tabular-nums"
          />
        </LabeledField>

        <div>
          <span className="block text-xs text-muted-foreground mb-1">As of</span>
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" className="text-sm font-normal h-auto py-1.5 px-2" />
              }
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5 opacity-50" />
              {formatDateShort(date)}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                // Clicking the selected day deselects it, and a balance has to
                // be dated, so that is ignored.
                onSelect={(next) => next && setDate(next)}
                // No account opened tomorrow, and a future opening balance
                // would sit past the end of the budget's own months. The API
                // refuses one too; this keeps it from being offered.
                disabled={{ after: new Date() }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <ActionButton disabled={!ready} onClick={submit}>
          {isCreating ? "Adding…" : "Add account"}
        </ActionButton>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {TRACKING_NOTE} A credit card's balance is what you owe, so enter it as a negative
        amount.
      </p>
      {balanceInvalid && (
        <p className="text-xs text-destructive">Enter a balance like 1200.50, or leave it blank.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

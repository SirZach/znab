import { useState } from "react";
import { FREQUENCY_OPTIONS } from "@/lib/schedule";
import type { FrequencyValue } from "@znab/shared";
import { ActionButton } from "@/components/common/action-button";
import { FieldInput } from "@/components/common/field-input";
import { FieldSelect } from "@/components/common/field-select";
import { MoneyInput } from "@/components/common/money-input";
import { LabeledField } from "@/components/scheduled/labeled-field";
import { ScheduleCategoryPicker } from "@/components/scheduled/schedule-category-picker";
import { ScheduleDatePicker } from "@/components/scheduled/schedule-date-picker";
import {
  SchedulePayeePicker,
  type PickablePayee,
} from "@/components/scheduled/schedule-payee-picker";
import type { CategoryOption } from "@/lib/category-options";
import {
  CLEARED_AFTER_ADD,
  draftFrom,
  draftStartDay,
  draftToSchedule,
  type NewScheduled,
  type ScheduleDraft,
  type ScheduleDraftSource,
} from "@/lib/schedule-draft";
import { cn, parseAmountExpression } from "@/lib/utils";

/** Only the first of a twice monthly pair is chosen, so days 1 to 15. */
const START_DAYS = Array.from({ length: 15 }, (_, i) => i + 1);

/**
 * Everything a schedule is made of, laid out across a band for a new one and
 * stacked down the side panel for one being changed. Both go through the same
 * fields so the two cannot drift apart.
 */
export function ScheduleForm({
  stacked = false,
  accounts,
  payees,
  categoryOptions,
  initial,
  submitLabel,
  isPending,
  error,
  onSubmit,
}: {
  stacked?: boolean;
  accounts: Array<{ id: number; name: string }>;
  payees: PickablePayee[] | undefined;
  categoryOptions: CategoryOption[];
  initial?: ScheduleDraftSource;
  submitLabel: string;
  isPending: boolean;
  error: string | null;
  /** `done` clears the form, for the caller that only wants it cleared on a save. */
  onSubmit: (values: NewScheduled, done: () => void) => void;
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(() => draftFrom(initial));

  const set = (patch: Partial<ScheduleDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const schedule = draftToSchedule(draft);
  const amountInvalid = draft.amount.trim() !== "" && parseAmountExpression(draft.amount) === null;
  const ready = schedule !== null && !isPending;

  function submit() {
    if (schedule === null || isPending) return;
    onSubmit(schedule, () => set(CLEARED_AFTER_ADD));
  }

  const field = stacked ? "w-full" : "w-40";

  return (
    <div className={cn(stacked ? "px-4 py-3 space-y-2" : "px-6 py-3 border-b border-border bg-accent/20")}>
      <div className={cn(stacked ? "space-y-2" : "flex flex-wrap items-end gap-3")}>
        <LabeledField label="Account">
          <FieldSelect
            value={draft.accountId ?? ""}
            onChange={(e) => set({ accountId: Number(e.target.value) })}
            className={field}
          >
            <option value="" disabled>
              Pick an account
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </FieldSelect>
        </LabeledField>

        <LabeledField label="Payee" as="div">
          <SchedulePayeePicker
            payees={payees}
            payeeId={draft.payeeId}
            payeeName={draft.payeeName}
            onChange={set}
            className={field}
          />
        </LabeledField>

        <LabeledField label="Category" as="div">
          <ScheduleCategoryPicker
            options={categoryOptions}
            categoryId={draft.categoryId}
            onChange={(categoryId) => set({ categoryId })}
            className={field}
          />
        </LabeledField>

        <LabeledField label="Direction">
          <FieldSelect
            value={draft.outflow ? "outflow" : "inflow"}
            onChange={(e) => set({ outflow: e.target.value === "outflow" })}
            className={stacked ? "w-full" : "w-28"}
          >
            <option value="outflow">Outflow</option>
            <option value="inflow">Inflow</option>
          </FieldSelect>
        </LabeledField>

        <LabeledField label="Amount">
          <MoneyInput
            value={draft.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className={stacked ? "w-full" : "w-28"}
          />
        </LabeledField>

        <LabeledField label="Next date" as="div">
          <ScheduleDatePicker
            date={draft.date}
            onChange={(date) => set({ date })}
            className={stacked ? "w-full" : ""}
          />
        </LabeledField>

        <LabeledField label="Frequency">
          <FieldSelect
            value={draft.frequency}
            onChange={(e) => set({ frequency: e.target.value as FrequencyValue })}
            className={field}
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FieldSelect>
        </LabeledField>

        {/* Only TwiceAMonth reads a start day, so nothing else is asked for one. */}
        {draft.frequency === "TwiceAMonth" && (
          <LabeledField label="Start day">
            <FieldSelect
              value={draftStartDay(draft)}
              onChange={(e) => set({ twiceMonthDay: Number(e.target.value) })}
              className={stacked ? "w-full" : "w-20"}
            >
              {/* The second of the pair falls fifteen days later, so past the
                  15th the two would collapse together at the end of a short
                  month. */}
              {START_DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </FieldSelect>
          </LabeledField>
        )}

        <LabeledField label="Memo (optional)" className={stacked ? "" : "min-w-40 flex-1"}>
          <FieldInput
            type="text"
            value={draft.memo}
            onChange={(e) => set({ memo: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) submit();
            }}
            className="w-full"
          />
        </LabeledField>

        <ActionButton disabled={!ready} onClick={submit} className={cn(stacked && "w-full")}>
          {submitLabel}
        </ActionButton>
      </div>

      {amountInvalid && (
        <p className="mt-2 text-xs text-destructive">
          Enter an amount like 45.50, or arithmetic like 25+13.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

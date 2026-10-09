import type { ComponentProps } from "react";
import { SidePanel } from "@/components/common/side-panel";
import { SidePanelHeader } from "@/components/common/side-panel-header";
import { ScheduleForm } from "@/components/scheduled/schedule-form";
import type { ScheduledTransaction } from "@/hooks/useScheduledTransactions";
import { frequencyLabel } from "@/lib/schedule";
import { scheduleLabel, type NewScheduled } from "@/lib/schedule-draft";
import { formatDate } from "@/lib/utils";

/** The side panel that changes one schedule. */
export function ScheduleEditPanel({
  schedule,
  accounts,
  payees,
  categoryOptions,
  isSaving,
  error,
  onSave,
  onClose,
}: Pick<ComponentProps<typeof ScheduleForm>, "accounts" | "payees" | "categoryOptions"> & {
  schedule: ScheduledTransaction;
  isSaving: boolean;
  error: string | null;
  onSave: (values: NewScheduled) => void;
  onClose: () => void;
}) {
  return (
    <SidePanel className="w-96">
      <SidePanelHeader
        title={scheduleLabel(schedule)}
        titleClassName="truncate"
        subtitle={
          <>
            {frequencyLabel(schedule.frequency)}, next {formatDate(schedule.date)}
          </>
        }
        onClose={onClose}
      />

      <ScheduleForm
        // Remounting per schedule is what resets the draft fields.
        key={schedule.id}
        stacked
        accounts={accounts}
        payees={payees}
        categoryOptions={categoryOptions}
        initial={schedule}
        submitLabel={isSaving ? "Saving…" : "Save changes"}
        isPending={isSaving}
        error={error}
        onSubmit={(values) => onSave(values)}
      />
    </SidePanel>
  );
}

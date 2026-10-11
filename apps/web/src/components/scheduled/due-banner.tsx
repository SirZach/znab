import { ActionButton } from "@/components/common/action-button";

const DUE_NOTE =
  "Entering a schedule writes the transaction it stands for and moves it on to its next date. Nothing is written until you ask for it.";

/** Says how many schedules are due and offers to enter them all. */
export function DueBanner({
  dueCount,
  isEnteringDue,
  onEnterDue,
}: {
  dueCount: number;
  isEnteringDue: boolean;
  onEnterDue: () => void;
}) {
  return (
    <div className="px-6 py-3 border-b border-border bg-primary/5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          {dueCount === 1 ? "1 schedule is due." : `${dueCount} schedules are due.`}
        </p>
        <ActionButton disabled={isEnteringDue} onClick={onEnterDue}>
          {isEnteringDue ? "Entering…" : "Enter all due"}
        </ActionButton>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{DUE_NOTE}</p>
    </div>
  );
}

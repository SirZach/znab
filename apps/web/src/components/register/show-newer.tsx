import { ActionButton } from "@/components/common/action-button";

/** The band below the rows when the register opened on an older transaction. */
export function ShowNewer({ onShowNewest }: { onShowNewest: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1 py-3 border-t border-border/50">
      <ActionButton variant="outline" className="text-xs px-3" onClick={onShowNewest}>
        Show the most recent transactions
      </ActionButton>
      <span className="text-xs text-muted-foreground">
        Opened on an older transaction, so newer ones are left off below.
      </span>
    </div>
  );
}

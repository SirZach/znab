import type { ReactNode, Ref } from "react";
import { RowError } from "@/components/register/row-error";
import { cn } from "@/lib/utils";

/**
 * One transaction's row in the register, the cells being `children`, with the
 * edit error under it while it is open. A row being edited takes no click, so
 * clicking into its controls does not select it.
 */
export function RegisterRow({
  editing,
  selected,
  focused,
  rowRef,
  onClick,
  error,
  children,
}: {
  editing: boolean;
  selected: boolean;
  /** The row a link opened the register on. */
  focused: boolean;
  rowRef?: Ref<HTMLTableRowElement>;
  onClick: (event: React.MouseEvent) => void;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <tr
        ref={rowRef}
        onClick={editing ? undefined : onClick}
        aria-selected={editing || selected}
        className={cn(
          "border-b border-border/50 transition-colors",
          !editing && "cursor-pointer",
          editing || selected ? "bg-accent/60" : "hover:bg-accent/30",
          // The linked row, outlined so it still stands out once it is selected
          // or opened.
          focused && "outline-2 -outline-offset-2 outline-primary bg-primary/10"
        )}
      >
        {children}
      </tr>

      {editing && error && (
        <RowError message={error} className="border-b border-border/50 bg-accent/60" />
      )}
    </>
  );
}

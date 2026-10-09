import { NameInput } from "@/components/common/name-input";

/**
 * A name that turns into a field when clicked. Whether an empty or unchanged
 * name is worth sending is the caller's call, as with `NameInput`.
 */
export function InlineName({
  name,
  editing,
  "aria-label": ariaLabel,
  onEdit,
  onCommit,
  onCancel,
}: {
  name: string;
  editing: boolean;
  "aria-label": string;
  onEdit: () => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <NameInput initial={name} aria-label={ariaLabel} onCommit={onCommit} onCancel={onCancel} />
    );
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      title="Click to rename"
      className="text-left rounded px-1 py-0.5 -mx-1 hover:bg-accent"
    >
      {name}
    </button>
  );
}

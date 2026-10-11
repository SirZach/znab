import { useRef, useState } from "react";

/**
 * Renames in place. It opens focused with the name selected; Enter or leaving
 * the field commits the trimmed name, Escape cancels. Whether an empty or
 * unchanged name is worth sending is the caller's call.
 */
export function NameInput({
  initial,
  onCommit,
  onCancel,
  "aria-label": ariaLabel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  "aria-label": string;
}) {
  const [draft, setDraft] = useState(initial);
  // Escape blurs the field too, so the blur has to know which way it is going.
  const cancelled = useRef(false);

  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (cancelled.current ? onCancel() : onCommit(draft.trim()))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className="w-full bg-transparent rounded px-1 py-0.5 -mx-1 focus:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

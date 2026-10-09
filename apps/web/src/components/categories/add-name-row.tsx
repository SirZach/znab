import { useState } from "react";
import { FieldInput } from "@/components/common/field-input";

/**
 * A name and a button, for a new category or a new group. It clears itself only
 * once the name really exists, so a refused one is left there to correct.
 */
export function AddNameRow({
  placeholder,
  ariaLabel,
  label,
  isPending,
  onAdd,
}: {
  placeholder: string;
  ariaLabel: string;
  label: string;
  isPending: boolean;
  onAdd: (name: string, onDone: () => void) => void;
}) {
  const [name, setName] = useState("");
  const ready = name.trim() !== "" && !isPending;
  const submit = () => onAdd(name.trim(), () => setName(""));

  return (
    <div className="flex items-center gap-2">
      <FieldInput
        type="text"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) submit();
        }}
        className="w-56"
      />
      <button
        type="button"
        disabled={!ready}
        onClick={submit}
        className="rounded border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-accent disabled:opacity-50 transition-colors"
      >
        {label}
      </button>
    </div>
  );
}

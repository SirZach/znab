import { ActionButton } from "@/components/common/action-button";
import { FieldSelect } from "@/components/common/field-select";
import type { ManagedPayee } from "@/hooks/usePayees";
import { mergePlan, mergeSummary } from "@/lib/payees";

/**
 * Merging is irreversible from here, so the target is named explicitly and the
 * consequence is spelled out before the button is live.
 */
export function MergeBar({
  checked,
  target,
  isMerging,
  onTargetChange,
  onClear,
  onMerge,
}: {
  checked: ManagedPayee[];
  target: ManagedPayee | null;
  isMerging: boolean;
  onTargetChange: (id: number | null) => void;
  onClear: () => void;
  onMerge: (sourceIds: number[], targetId: number) => void;
}) {
  const { sources, moving } = mergePlan(checked, target);

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-accent/30 text-sm">
      <span className="font-medium">{checked.length} selected</span>

      <label className="flex items-center gap-2">
        Keep
        <FieldSelect
          aria-label="Payee to merge into"
          value={target?.id ?? ""}
          onChange={(e) => onTargetChange(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">Choose the payee to keep…</option>
          {checked.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FieldSelect>
      </label>

      <span className="text-muted-foreground">
        {mergeSummary(target, sources.length, moving)}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-border px-3 py-1.5 hover:bg-accent transition-colors"
        >
          Clear
        </button>
        <ActionButton
          disabled={!target || isMerging}
          onClick={() => {
            if (target) onMerge(sources.map((p) => p.id), target.id);
          }}
        >
          {isMerging ? "Merging…" : "Merge"}
        </ActionButton>
      </div>
    </div>
  );
}

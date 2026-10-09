import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CenteredMessage } from "@/components/common/centered-message";
import { FieldInput } from "@/components/common/field-input";
import { PageHeader } from "@/components/common/page-header";
import { MergeBar } from "@/components/payees/merge-bar";
import { MergeStatus } from "@/components/payees/merge-status";
import { PayeeInspector } from "@/components/payees/payee-inspector";
import { PayeeTable } from "@/components/payees/payee-table";
import { usePayees, type ManagedPayee } from "@/hooks/usePayees";
import { PAYEE_PAGE_SIZE, filterPayees, payeeCountLabel } from "@/lib/payees";

export const Route = createFileRoute("/budgets/$budgetId/payees")({
  component: PayeesPage,
});

function PayeesPage() {
  const { budgetId } = Route.useParams();

  const [search, setSearch] = useState("");
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAYEE_PAGE_SIZE);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [inspectedId, setInspectedId] = useState<number | null>(null);

  const {
    payees,
    categoryOptions,
    isLoading,
    rename,
    merge,
    remove,
    setAutofill,
    addRenameRule,
    deleteRenameRule,
    isMerging,
    isSavingAutofill,
    isAddingRule,
    renameError,
    mergeError,
    deleteError,
    autofillError,
    ruleError,
    mergeResult,
    resetStatus,
  } = usePayees({ budgetId: Number(budgetId), includeDisabled });

  const filtered = filterPayees(payees, search);
  const visible = filtered.slice(0, visibleCount);

  // Selections and the open panel are resolved against the live list each
  // render, so a payee merged away or deleted drops out of both by itself.
  const checked = payees.filter((p) => checkedIds.has(p.id));
  const inspected = payees.find((p) => p.id === inspectedId);
  const mergeTarget = checked.find((p) => p.id === mergeTargetId) ?? null;

  function toggleChecked(id: number) {
    resetStatus();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  // A mutation error names the payee it was made against, and the hook keeps it
  // past the remount that clears the panel's own drafts, so changing subject has
  // to drop it explicitly.
  function inspect(id: number | null) {
    resetStatus();
    setInspectedId(id);
  }

  function commitRename(payee: ManagedPayee, name: string) {
    setEditingId(null);
    if (!name || name === payee.name) return;
    rename(payee.id, name);
  }

  if (isLoading) {
    return <CenteredMessage className="h-full">Loading payees…</CenteredMessage>;
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Payees"
        subtitle={payeeCountLabel(filtered.length, payees.length, search.trim() !== "")}
        className="flex flex-wrap items-center gap-4"
      >
        <FieldInput
          type="search"
          aria-label="Search payees"
          placeholder="Search payees…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(PAYEE_PAGE_SIZE);
          }}
          className="ml-auto w-64"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeDisabled}
            onChange={(e) => setIncludeDisabled(e.target.checked)}
          />
          Show disabled
        </label>
      </PageHeader>

      {checked.length >= 2 && (
        <MergeBar
          checked={checked}
          target={mergeTarget}
          isMerging={isMerging}
          onTargetChange={setMergeTargetId}
          onClear={() => {
            setCheckedIds(new Set());
            setMergeTargetId(null);
          }}
          onMerge={merge}
        />
      )}

      <MergeStatus
        mergeError={mergeError}
        renameError={renameError}
        mergeResult={mergeResult}
        targetName={mergeTarget?.name ?? null}
      />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto">
          <PayeeTable
            visible={visible}
            matchCount={filtered.length}
            totalCount={payees.length}
            search={search}
            inspectedId={inspectedId}
            checkedIds={checkedIds}
            editingId={editingId}
            onInspect={inspect}
            onToggleChecked={toggleChecked}
            onStartRename={setEditingId}
            onCommitRename={commitRename}
            onCancelRename={() => setEditingId(null)}
            onShowMore={() => setVisibleCount((n) => n + PAYEE_PAGE_SIZE)}
          />
        </div>

        {inspected && (
          <PayeeInspector
            // Remounting per payee is what resets the draft autofill fields.
            key={inspected.id}
            payee={inspected}
            categoryOptions={categoryOptions}
            isSavingAutofill={isSavingAutofill}
            isAddingRule={isAddingRule}
            autofillError={autofillError}
            ruleError={ruleError}
            onSetAutofill={setAutofill}
            onAddRule={addRenameRule}
            onDeleteRule={deleteRenameRule}
            onDelete={remove}
            deleteError={deleteError}
            onClose={() => inspect(null)}
          />
        )}
      </div>
    </div>
  );
}

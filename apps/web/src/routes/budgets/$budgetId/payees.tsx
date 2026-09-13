import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Lock, Tag, Wand2, X } from "lucide-react";
import { PAYEE_RENAME_OPERATORS, type PayeeRenameOperator } from "@znab/shared";
import { usePayees, type ManagedPayee } from "@/hooks/usePayees";
import { cn, formatCurrency, formatDate, parseAmountExpression } from "@/lib/utils";

export const Route = createFileRoute("/budgets/$budgetId/payees")({
  component: PayeesPage,
});

/**
 * How many rows are drawn at a time. A budget carries around a thousand payees,
 * and searching narrows that to a handful, so the tail is only mounted if
 * someone actually scrolls for it.
 */
const PAGE_SIZE = 100;

const OPERATOR_LABELS: Record<PayeeRenameOperator, string> = {
  Is: "Is",
  Contains: "Contains",
  StartsWith: "Starts with",
  EndsWith: "Ends with",
};

/** Transfer payees mirror an account, so this screen may only look at them. */
const TRANSFER_NOTE =
  "This is a transfer payee. It follows its account, so it cannot be renamed, merged or deleted here.";

/**
 * Whether the payee carries real entry defaults. An imported YNAB 4 budget
 * stores an empty memo and a zero amount rather than nothing, so a plain null
 * check would mark almost every payee as autofilled.
 */
function hasAutofill(payee: ManagedPayee) {
  return (
    payee.autofillCategoryId !== null ||
    (payee.autofillAmount !== null && Number(payee.autofillAmount) !== 0) ||
    (payee.autofillMemo ?? "").trim() !== ""
  );
}

const fieldClass =
  "rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function PayeesPage() {
  const { budgetId } = Route.useParams();

  const [search, setSearch] = useState("");
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
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

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? payees.filter((p) => p.name.toLowerCase().includes(needle))
    : payees;
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

  function commitRename(payee: ManagedPayee, draft: string) {
    setEditingId(null);
    const name = draft.trim();
    if (!name || name === payee.name) return;
    rename(payee.id, name);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading payees…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header and search */}
      <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-xl font-semibold">Payees</h2>
          <p className="text-sm text-muted-foreground">
            {needle
              ? `${filtered.length} of ${payees.length} payees`
              : `${payees.length} payees`}
          </p>
        </div>
        <input
          type="search"
          aria-label="Search payees"
          placeholder="Search payees…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          className={cn(fieldClass, "ml-auto w-64")}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeDisabled}
            onChange={(e) => setIncludeDisabled(e.target.checked)}
          />
          Show disabled
        </label>
      </div>

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
          onMerge={() => {
            if (!mergeTarget) return;
            merge(
              checked.filter((p) => p.id !== mergeTarget.id).map((p) => p.id),
              mergeTarget.id
            );
          }}
        />
      )}

      {(mergeResult || mergeError || renameError) && (
        <div className="px-6 py-2 border-b border-border text-sm">
          {mergeError && <p className="text-destructive">{mergeError}</p>}
          {renameError && <p className="text-destructive">{renameError}</p>}
          {mergeResult && !mergeError && (
            <p className="text-muted-foreground">
              Merged{mergeTarget ? ` into "${mergeTarget.name}"` : ""}, moving{" "}
              {mergeResult.movedTransactions} transactions and{" "}
              {mergeResult.movedRenameRules} rename rules.
            </p>
          )}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-muted-foreground">
                <th className="w-10 px-6 py-2" />
                <th className="text-left px-2 py-2 font-medium">Payee</th>
                <th className="w-16 px-2 py-2" />
                <th className="text-right px-4 py-2 font-medium w-32">
                  Transactions
                </th>
                <th className="text-right px-6 py-2 font-medium w-40">Last used</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((payee) => {
                const isTransfer = payee.targetAccountId !== null;
                return (
                  <tr
                    key={payee.id}
                    onClick={() => setInspectedId(payee.id)}
                    aria-selected={payee.id === inspectedId}
                    className={cn(
                      "border-b border-border/50 cursor-pointer transition-colors",
                      payee.id === inspectedId ? "bg-accent/60" : "hover:bg-accent/30"
                    )}
                  >
                    <td className="px-6 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${payee.name}`}
                        disabled={isTransfer}
                        title={isTransfer ? TRANSFER_NOTE : undefined}
                        checked={checkedIds.has(payee.id)}
                        onChange={() => toggleChecked(payee.id)}
                      />
                    </td>

                    <td className="px-2 py-2">
                      {editingId === payee.id ? (
                        <NameInput
                          initial={payee.name}
                          onCommit={(draft) => commitRename(payee, draft)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : isTransfer ? (
                        <span
                          title={TRANSFER_NOTE}
                          className="flex items-center gap-1.5 text-muted-foreground"
                        >
                          <Lock size={12} className="shrink-0" />
                          {payee.name}
                        </span>
                      ) : (
                        <button
                          onClick={() => setEditingId(payee.id)}
                          title="Click to rename"
                          className="text-left rounded px-1 py-0.5 -mx-1 hover:bg-accent"
                        >
                          {payee.name}
                        </button>
                      )}
                      {!payee.enabled && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          disabled
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {hasAutofill(payee) && (
                          <span
                            title={
                              payee.autofillAmount === null
                                ? "Has autofill defaults"
                                : `Autofills ${formatCurrency(payee.autofillAmount)}`
                            }
                          >
                            <Wand2 size={13} />
                          </span>
                        )}
                        {payee.renameRules.length > 0 && (
                          <span
                            title={`${payee.renameRules.length} rename rule${
                              payee.renameRules.length === 1 ? "" : "s"
                            }`}
                          >
                            <Tag size={13} />
                          </span>
                        )}
                      </span>
                    </td>

                    <td className="text-right px-4 py-2 tabular-nums text-muted-foreground">
                      {payee.transactionCount}
                    </td>
                    <td className="text-right px-6 py-2 tabular-nums text-muted-foreground">
                      {payee.lastUsed ? formatDate(payee.lastUsed) : "Never"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <p className="px-6 py-8 text-center text-muted-foreground">
              {payees.length === 0
                ? "No payees yet. They are created as you enter transactions."
                : `No payees match "${search.trim()}".`}
            </p>
          )}

          {filtered.length > visible.length && (
            <div className="px-6 py-4 text-center">
              <button
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="rounded border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-accent transition-colors"
              >
                Show more ({filtered.length - visible.length} remaining)
              </button>
            </div>
          )}
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
            onClose={() => setInspectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Inline rename ────────────────────────────────────────────────────────────

/**
 * A payee name, editable in place: commits on blur or Enter, reverts on Escape.
 * Escape sets a flag rather than resetting the draft, since the blur it triggers
 * would otherwise read the draft as it was before React re-rendered.
 */
function NameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const cancelled = useRef(false);

  return (
    <input
      autoFocus
      aria-label="Payee name"
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (cancelled.current ? onCancel() : onCommit(draft))}
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

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Merging is irreversible from here, so the target is named explicitly and the
 * consequence is spelled out before the button is live.
 */
function MergeBar({
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
  onMerge: () => void;
}) {
  const sources = checked.filter((p) => p.id !== target?.id);
  const moving = sources.reduce((n, p) => n + p.transactionCount, 0);

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-accent/30 text-sm">
      <span className="font-medium">{checked.length} selected</span>

      <label className="flex items-center gap-2">
        Keep
        <select
          aria-label="Payee to merge into"
          value={target?.id ?? ""}
          onChange={(e) =>
            onTargetChange(e.target.value === "" ? null : Number(e.target.value))
          }
          className={fieldClass}
        >
          <option value="">Choose the payee to keep…</option>
          {checked.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <span className="text-muted-foreground">
        {target
          ? `Merge ${sources.length} ${
              sources.length === 1 ? "payee" : "payees"
            } into "${target.name}", moving ${moving} ${
              moving === 1 ? "transaction" : "transactions"
            }. The other names are removed.`
          : "Choose which payee to keep."}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onClear}
          className="rounded border border-border px-3 py-1.5 hover:bg-accent transition-colors"
        >
          Clear
        </button>
        <button
          disabled={!target || isMerging}
          onClick={onMerge}
          className="rounded bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isMerging ? "Merging…" : "Merge"}
        </button>
      </div>
    </div>
  );
}

// ─── Side panel ───────────────────────────────────────────────────────────────

function PayeeInspector({
  payee,
  categoryOptions,
  isSavingAutofill,
  isAddingRule,
  autofillError,
  ruleError,
  onSetAutofill,
  onAddRule,
  onDeleteRule,
  onDelete,
  deleteError,
  onClose,
}: {
  payee: ManagedPayee;
  categoryOptions: Array<{ id: number; label: string }>;
  isSavingAutofill: boolean;
  isAddingRule: boolean;
  autofillError: string | null;
  ruleError: string | null;
  onSetAutofill: (args: {
    id: number;
    categoryId: number | null;
    amount: number | null;
    memo: string | null;
  }) => void;
  onAddRule: (
    payeeId: number,
    operator: PayeeRenameOperator,
    operand: string,
    onDone?: () => void
  ) => void;
  onDeleteRule: (id: number) => void;
  onDelete: (id: number) => void;
  deleteError: string | null;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState<number | "">(
    payee.autofillCategoryId ?? ""
  );
  // The amount arrives as a NUMERIC string ("-25.0000"), which is not what
  // anyone wants to edit.
  const [amount, setAmount] = useState(
    payee.autofillAmount === null ? "" : String(Number(payee.autofillAmount))
  );
  const [memo, setMemo] = useState(payee.autofillMemo ?? "");

  const [operator, setOperator] = useState<PayeeRenameOperator>("Contains");
  const [operand, setOperand] = useState("");

  const amountText = amount.trim();
  const amountValue = amountText === "" ? null : parseAmountExpression(amountText);
  const amountInvalid = amountText !== "" && amountValue === null;

  const isTransfer = payee.targetAccountId !== null;

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{payee.name}</h3>
          <p className="text-xs text-muted-foreground">
            {payee.transactionCount} transactions
            {payee.lastUsed ? `, last used ${formatDate(payee.lastUsed)}` : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {isTransfer && (
        <p className="flex gap-2 px-4 py-3 border-b border-border text-xs text-muted-foreground">
          <Lock size={13} className="shrink-0 mt-0.5" />
          {TRANSFER_NOTE}
        </p>
      )}

      {/* Autofill defaults */}
      <section className="px-4 py-3 border-b border-border space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Autofill
        </h4>
        <p className="text-xs text-muted-foreground">
          Filled in automatically when this payee is chosen on a new transaction.
        </p>

        <select
          aria-label="Autofill category"
          value={categoryId}
          onChange={(e) =>
            setCategoryId(e.target.value === "" ? "" : Number(e.target.value))
          }
          className={cn(fieldClass, "w-full")}
        >
          <option value="">No category</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          inputMode="decimal"
          aria-label="Autofill amount"
          placeholder="Amount (outflow is negative)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={cn(fieldClass, "w-full text-right tabular-nums")}
        />

        <input
          type="text"
          aria-label="Autofill memo"
          placeholder="Memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className={cn(fieldClass, "w-full")}
        />

        <button
          disabled={amountInvalid || isSavingAutofill}
          onClick={() =>
            onSetAutofill({
              id: payee.id,
              categoryId: categoryId === "" ? null : categoryId,
              amount: amountValue,
              memo: memo.trim() || null,
            })
          }
          className="w-full rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSavingAutofill ? "Saving…" : "Save autofill"}
        </button>

        {amountInvalid && (
          <p className="text-xs text-destructive">
            Enter an amount like 12.50, or leave it blank.
          </p>
        )}
        {autofillError && <p className="text-xs text-destructive">{autofillError}</p>}
      </section>

      {/* Rename rules */}
      <section className="px-4 py-3 border-b border-border space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Rename rules
        </h4>
        <p className="text-xs text-muted-foreground">
          Maps a name from an imported bank file onto this payee. Importing bank
          files is not built yet, so rules are stored but nothing reads them.
        </p>

        {payee.renameRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No rules.</p>
        ) : (
          <ul className="space-y-1">
            {payee.renameRules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm"
              >
                <span className="text-xs text-muted-foreground shrink-0">
                  {OPERATOR_LABELS[rule.operator]}
                </span>
                <span className="truncate">{rule.operand}</span>
                <button
                  onClick={() => onDeleteRule(rule.id)}
                  aria-label={`Remove rule ${rule.operand}`}
                  className="ml-auto p-0.5 rounded text-muted-foreground hover:text-destructive"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <select
            aria-label="Rule operator"
            value={operator}
            onChange={(e) => setOperator(e.target.value as PayeeRenameOperator)}
            className={cn(fieldClass, "shrink-0")}
          >
            {PAYEE_RENAME_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </option>
            ))}
          </select>
          <input
            type="text"
            aria-label="Rule text"
            placeholder="Bank text"
            value={operand}
            onChange={(e) => setOperand(e.target.value)}
            className={cn(fieldClass, "min-w-0 flex-1")}
          />
        </div>

        <button
          disabled={!operand.trim() || isAddingRule}
          onClick={() =>
            onAddRule(payee.id, operator, operand.trim(), () => setOperand(""))
          }
          className="w-full rounded border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {isAddingRule ? "Adding…" : "Add rule"}
        </button>

        {ruleError && <p className="text-xs text-destructive">{ruleError}</p>}
      </section>

      {/* Removal */}
      <section className="px-4 py-3">
        {isTransfer ? (
          <p className="text-xs text-muted-foreground">
            Delete the account to remove this payee.
          </p>
        ) : payee.transactionCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Used by {payee.transactionCount} transactions, so it cannot be deleted.
            Select it along with another payee to merge them, which keeps the
            history.
          </p>
        ) : (
          <button
            onClick={() => onDelete(payee.id)}
            className="w-full rounded border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            Delete payee
          </button>
        )}
        {deleteError && (
          <p className="mt-2 text-xs text-destructive">{deleteError}</p>
        )}
      </section>
    </aside>
  );
}

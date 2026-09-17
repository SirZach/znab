import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/budgets/$budgetId/categories/")({
  component: CategoriesPage,
});

/**
 * Income, Hidden Categories, Pre-YNAB Debt and Internal are the budget's own
 * machinery rather than envelopes anyone keeps, so they are shown locked rather
 * than left out: seeing why they cannot be touched beats wondering where the
 * category that lives in one went.
 */
const SYSTEM_NOTE =
  "This group belongs to the budget itself, so neither it nor the categories in it can be renamed, reordered, moved or deleted.";

const DELETE_NOTE =
  "A category can be deleted only while nothing has been budgeted to it and nothing spent from it; the rest are marked in use here and are hidden from the budget grid instead. A group can be deleted once it holds no categories.";

const fieldClass =
  "rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

/** The ids of `items` with these two swapped, which is what a reorder sends. */
function swapped(items: Array<{ id: number }>, a: number, b: number) {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(a);
  const to = ids.indexOf(b);
  ids[from] = b;
  ids[to] = a;
  return ids;
}

/** What the confirm dialog is asking about, or nothing. */
type Doomed = { kind: "category" | "group"; id: number; name: string };

function CategoriesPage() {
  const { budgetId } = Route.useParams();

  // A category and a group can share an id, so what is being renamed is keyed
  // by both.
  const [editing, setEditing] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<Doomed | null>(null);

  const {
    groups,
    isLoading,
    create,
    rename,
    remove,
    move,
    reorder,
    createGroup,
    renameGroup,
    removeGroup,
    reorderGroups,
    isCreating,
    isCreatingGroup,
    isReordering,
    createError,
    renameError,
    deleteError,
    moveError,
    reorderError,
    createGroupError,
    renameGroupError,
    deleteGroupError,
    reorderGroupsError,
    resetStatus,
  } = useCategories({ budgetId: Number(budgetId) });

  // Reordering and moving only ever concern the groups a person keeps, so the
  // system ones are taken out of both the order that is sent and the places a
  // category can be moved to.
  const movable = groups.filter((group) => !group.isSystem);
  const categoryCount = groups.reduce((n, g) => n + g.categories.length, 0);

  const errors = [
    createError,
    renameError,
    deleteError,
    moveError,
    reorderError,
    createGroupError,
    renameGroupError,
    deleteGroupError,
    reorderGroupsError,
  ].filter((message) => message !== null);

  // A refusal names what it was made against, so changing subject drops it.
  function confirmDelete(next: Doomed) {
    resetStatus();
    setDoomed(next);
  }

  function commitDelete() {
    if (!doomed) return;
    setDoomed(null);
    if (doomed.kind === "category") remove(doomed.id);
    else removeGroup(doomed.id);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading categories…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-xl font-semibold">Categories</h2>
        <p className="text-sm text-muted-foreground">
          {categoryCount} categories in {groups.length} groups
        </p>
      </div>

      <div className="px-6 py-3 border-b border-border bg-accent/20">
        <AddRow
          placeholder="New group"
          ariaLabel="New group name"
          label={isCreatingGroup ? "Adding…" : "Add group"}
          isPending={isCreatingGroup}
          onAdd={createGroup}
        />
        <p className="mt-2 text-xs text-muted-foreground">{DELETE_NOTE}</p>
      </div>

      {errors.length > 0 && (
        <div className="px-6 py-2 border-b border-border">
          {errors.map((message, i) => (
            <p key={i} className="text-xs text-destructive">
              {message}
            </p>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {groups.map((group) => {
              // Up and down step between groups a person keeps, so a system
              // group sitting between two of them is stepped over rather than
              // landed on.
              const g = movable.indexOf(group);
              const up = g < 0 ? undefined : movable[g - 1];
              const down = g < 0 ? undefined : movable[g + 1];
              const targets = movable.filter((m) => m.id !== group.id);

              return (
                <Fragment key={group.id}>
                  <tr className="border-b border-border/50">
                    <td className="w-20 px-6 pt-4 pb-1 align-bottom">
                      {!group.isSystem && (
                        <Arrows
                          label={group.name}
                          up={up}
                          down={down}
                          onMove={(other) =>
                            reorderGroups(swapped(movable, group.id, other.id))
                          }
                          disabled={isReordering}
                        />
                      )}
                    </td>

                    <td className="px-2 pt-4 pb-1 font-semibold">
                      {group.isSystem ? (
                        <span
                          title={SYSTEM_NOTE}
                          className="flex items-center gap-1.5 text-muted-foreground"
                        >
                          <Lock size={12} className="shrink-0" />
                          {group.name}
                        </span>
                      ) : editing === `g${group.id}` ? (
                        <NameInput
                          initial={group.name}
                          aria-label="Group name"
                          onCommit={(name) => {
                            setEditing(null);
                            if (name && name !== group.name) renameGroup(group.id, name);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setEditing(`g${group.id}`)}
                          title="Click to rename"
                          className="text-left rounded px-1 py-0.5 -mx-1 hover:bg-accent"
                        >
                          {group.name}
                        </button>
                      )}
                    </td>

                    <td />

                    <td className="w-10 px-6 pt-4 pb-1 text-right">
                      {/* A group holding categories would be refused, and the
                          note above the list says so, so it is not offered. */}
                      {!group.isSystem && group.categories.length === 0 && (
                        <DeleteButton
                          label={group.name}
                          onClick={() =>
                            confirmDelete({
                              kind: "group",
                              id: group.id,
                              name: group.name,
                            })
                          }
                        />
                      )}
                    </td>
                  </tr>

                  {group.categories.map((category, i) => {
                    // A system group's categories are the budget's own too, so
                    // they are listed and nothing more. The lock on the group
                    // says why, without repeating it on every row.
                    if (group.isSystem)
                      return (
                        <tr key={category.id} className="border-b border-border/50">
                          <td />
                          <td
                            colSpan={3}
                            className="py-2 pl-8 pr-6 text-muted-foreground"
                          >
                            {category.name}
                          </td>
                        </tr>
                      );

                    const above = group.categories[i - 1];
                    const below = group.categories[i + 1];
                    return (
                      <tr key={category.id} className="border-b border-border/50">
                        <td className="w-20 px-6 py-2">
                          <Arrows
                            label={category.name}
                            up={above}
                            down={below}
                            onMove={(other) =>
                              reorder(
                                group.id,
                                swapped(group.categories, category.id, other.id)
                              )
                            }
                            disabled={isReordering}
                          />
                        </td>

                        <td className="py-2 pl-8 pr-2">
                          {editing === `c${category.id}` ? (
                            <NameInput
                              initial={category.name}
                              aria-label="Category name"
                              onCommit={(name) => {
                                setEditing(null);
                                if (name && name !== category.name)
                                  rename(category.id, name);
                              }}
                              onCancel={() => setEditing(null)}
                            />
                          ) : (
                            <button
                              onClick={() => setEditing(`c${category.id}`)}
                              title="Click to rename"
                              className="text-left rounded px-1 py-0.5 -mx-1 hover:bg-accent"
                            >
                              {category.name}
                            </button>
                          )}
                        </td>

                        <td className="px-2 py-2 text-right">
                          {targets.length > 0 && (
                            <select
                              // Always empty: this picks a destination rather
                              // than holding one, so it snaps back once the
                              // category has moved.
                              value=""
                              aria-label={`Move ${category.name} to another group`}
                              onChange={(e) => move(category.id, Number(e.target.value))}
                              className={cn(fieldClass, "text-muted-foreground")}
                            >
                              <option value="">Move to…</option>
                              {targets.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>

                        <td className="w-10 px-6 py-2 text-right">
                          {/* An action that would be refused is not offered,
                              the way the accounts screen decides its own. Only
                              a category nothing points at can go; the rest are
                              hidden from the budget grid instead. */}
                          {category.used > 0 ? (
                            <span
                              className="text-xs text-muted-foreground"
                              title={`Used by ${category.used} allocation${
                                category.used === 1 ? "" : "s"
                              } or transaction${
                                category.used === 1 ? "" : "s"
                              }, so it cannot be deleted. Hide it from the budget grid instead.`}
                            >
                              in use
                            </span>
                          ) : (
                            <DeleteButton
                              label={category.name}
                              onClick={() =>
                                confirmDelete({
                                  kind: "category",
                                  id: category.id,
                                  name: category.name,
                                })
                              }
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {!group.isSystem && (
                    <tr className="border-b border-border/50">
                      <td />
                      <td colSpan={3} className="py-2 pl-8 pr-2">
                        <AddRow
                          placeholder="New category"
                          ariaLabel={`New category in ${group.name}`}
                          label={isCreating ? "Adding…" : "Add category"}
                          isPending={isCreating}
                          onAdd={(name, onDone) => create(group.id, name, onDone)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hiding a category can be undone from the grid; deleting one cannot. */}
      {doomed && (
        <Dialog open onOpenChange={(open) => !open && setDoomed(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete this {doomed.kind}?</DialogTitle>
              <DialogDescription>
                {doomed.kind === "group"
                  ? `"${doomed.name}" holds no categories, so nothing is lost, but it cannot be brought back from here.`
                  : `"${doomed.name}" has never been budgeted to or spent from, so nothing is lost, but it cannot be brought back from here.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDoomed(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={commitDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Row controls ─────────────────────────────────────────────────────────────

/**
 * Up and down, each dead when there is no neighbour that way. The neighbour is
 * handed back rather than named, since a group and a category swap against
 * different orders.
 */
function Arrows<T extends { id: number }>({
  label,
  up,
  down,
  onMove,
  disabled,
}: {
  label: string;
  up?: T;
  down?: T;
  onMove: (neighbour: T) => void;
  disabled: boolean;
}) {
  return (
    <span className="flex gap-1 text-muted-foreground">
      <button
        disabled={!up || disabled}
        onClick={() => up && onMove(up)}
        aria-label={`Move ${label} up`}
        className="rounded p-0.5 hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronUp size={14} />
      </button>
      <button
        disabled={!down || disabled}
        onClick={() => down && onMove(down)}
        aria-label={`Move ${label} down`}
        className="rounded p-0.5 hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <ChevronDown size={14} />
      </button>
    </span>
  );
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Delete ${label}`}
      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
    >
      <Trash2 size={13} />
    </button>
  );
}

// ─── Inline rename ────────────────────────────────────────────────────────────

/**
 * A name, editable in place: commits on blur or Enter, reverts on Escape.
 * Escape sets a flag rather than resetting the draft, since the blur it triggers
 * would otherwise read the draft as it was before React re-rendered.
 */
function NameInput({
  initial,
  onCommit,
  onCancel,
  ...props
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  "aria-label": string;
}) {
  const [draft, setDraft] = useState(initial);
  const cancelled = useRef(false);

  return (
    <input
      autoFocus
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
      {...props}
    />
  );
}

// ─── Adding ───────────────────────────────────────────────────────────────────

/**
 * A name and a button, for a new category or a new group. It clears itself only
 * once the name really exists, so a refused one is left there to correct.
 */
function AddRow({
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
      <input
        type="text"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) submit();
        }}
        className={cn(fieldClass, "w-56")}
      />
      <button
        disabled={!ready}
        onClick={submit}
        className="rounded border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-accent disabled:opacity-50 transition-colors"
      >
        {label}
      </button>
    </div>
  );
}

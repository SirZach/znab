import { Fragment } from "react";
import { Lock } from "lucide-react";
import { FieldSelect } from "@/components/common/field-select";
import { AddNameRow } from "@/components/categories/add-name-row";
import { DeleteIconButton } from "@/components/categories/delete-icon-button";
import { InlineName } from "@/components/categories/inline-name";
import { ReorderArrows } from "@/components/categories/reorder-arrows";
import type { ManagedGroup } from "@/hooks/useCategories";
import { type DoomedCategory, groupPlacement } from "@/lib/category-groups";
import { swapIds } from "@/lib/reorder";

/**
 * Income, Hidden Categories, Pre-YNAB Debt and Internal are the budget's own
 * machinery rather than envelopes anyone keeps, so they are shown locked rather
 * than left out: seeing why they cannot be touched beats wondering where the
 * category that lives in one went.
 */
const SYSTEM_NOTE =
  "This group belongs to the budget itself, so neither it nor the categories in it can be renamed, reordered, moved or deleted.";

/**
 * One group's rows in the manage table: its header, its categories and the row
 * that adds one. `editing` is keyed `g<id>` or `c<id>`, since a category and a
 * group can share an id.
 */
export function CategoryGroupRows({
  group,
  movable,
  editing,
  onEdit,
  isReordering,
  isCreating,
  onReorderGroups,
  onRenameGroup,
  onReorder,
  onRename,
  onMove,
  onCreate,
  onDelete,
}: {
  group: ManagedGroup;
  movable: ManagedGroup[];
  editing: string | null;
  onEdit: (key: string | null) => void;
  isReordering: boolean;
  isCreating: boolean;
  onReorderGroups: (groupIds: number[]) => void;
  onRenameGroup: (groupId: number, name: string) => void;
  onReorder: (groupId: number, categoryIds: number[]) => void;
  onRename: (categoryId: number, name: string) => void;
  onMove: (categoryId: number, groupId: number) => void;
  onCreate: (groupId: number, name: string, onDone: () => void) => void;
  onDelete: (doomed: DoomedCategory) => void;
}) {
  const { up, down, targets } = groupPlacement(movable, group);

  return (
    <Fragment>
      <tr className="border-b border-border/50">
        <td className="w-20 px-6 pt-4 pb-1 align-bottom">
          {!group.isSystem && (
            <ReorderArrows
              label={group.name}
              up={up}
              down={down}
              onMove={(other) => onReorderGroups(swapIds(movable, group.id, other.id))}
              disabled={isReordering}
            />
          )}
        </td>

        <td className="px-2 pt-4 pb-1 font-semibold">
          {group.isSystem ? (
            <span title={SYSTEM_NOTE} className="flex items-center gap-1.5 text-muted-foreground">
              <Lock size={12} className="shrink-0" />
              {group.name}
            </span>
          ) : (
            <InlineName
              name={group.name}
              editing={editing === `g${group.id}`}
              aria-label="Group name"
              onEdit={() => onEdit(`g${group.id}`)}
              onCommit={(name) => {
                onEdit(null);
                if (name && name !== group.name) onRenameGroup(group.id, name);
              }}
              onCancel={() => onEdit(null)}
            />
          )}
        </td>

        <td />

        <td className="w-10 px-6 pt-4 pb-1 text-right">
          {/* A group holding categories would be refused, and the note above
              the list says so, so it is not offered. */}
          {!group.isSystem && group.categories.length === 0 && (
            <DeleteIconButton
              label={group.name}
              onClick={() => onDelete({ kind: "group", id: group.id, name: group.name })}
            />
          )}
        </td>
      </tr>

      {group.categories.map((category, i) => {
        // A system group's categories are the budget's own too, so they are
        // listed and nothing more. The lock on the group says why, without
        // repeating it on every row.
        if (group.isSystem)
          return (
            <tr key={category.id} className="border-b border-border/50">
              <td />
              <td colSpan={3} className="py-2 pl-8 pr-6 text-muted-foreground">
                {category.name}
              </td>
            </tr>
          );

        const above = group.categories[i - 1];
        const below = group.categories[i + 1];
        return (
          <tr key={category.id} className="border-b border-border/50">
            <td className="w-20 px-6 py-2">
              <ReorderArrows
                label={category.name}
                up={above}
                down={below}
                onMove={(other) =>
                  onReorder(group.id, swapIds(group.categories, category.id, other.id))
                }
                disabled={isReordering}
              />
            </td>

            <td className="py-2 pl-8 pr-2">
              <InlineName
                name={category.name}
                editing={editing === `c${category.id}`}
                aria-label="Category name"
                onEdit={() => onEdit(`c${category.id}`)}
                onCommit={(name) => {
                  onEdit(null);
                  if (name && name !== category.name) onRename(category.id, name);
                }}
                onCancel={() => onEdit(null)}
              />
            </td>

            <td className="px-2 py-2 text-right">
              {targets.length > 0 && (
                <FieldSelect
                  // Always empty: this picks a destination rather than holding
                  // one, so it snaps back once the category has moved.
                  value=""
                  aria-label={`Move ${category.name} to another group`}
                  onChange={(e) => onMove(category.id, Number(e.target.value))}
                  className="text-muted-foreground"
                >
                  <option value="">Move to…</option>
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </FieldSelect>
              )}
            </td>

            <td className="w-10 px-6 py-2 text-right">
              {/* An action that would be refused is not offered, the way the
                  accounts screen decides its own. Only a category nothing
                  points at can go; the rest are hidden from the budget grid
                  instead. */}
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
                <DeleteIconButton
                  label={category.name}
                  onClick={() =>
                    onDelete({ kind: "category", id: category.id, name: category.name })
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
            <AddNameRow
              placeholder="New category"
              ariaLabel={`New category in ${group.name}`}
              label={isCreating ? "Adding…" : "Add category"}
              isPending={isCreating}
              onAdd={(name, onDone) => onCreate(group.id, name, onDone)}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

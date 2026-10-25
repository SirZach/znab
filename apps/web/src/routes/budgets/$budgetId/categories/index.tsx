import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CenteredMessage } from "@/components/common/centered-message";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorList } from "@/components/common/error-list";
import { PageHeader } from "@/components/common/page-header";
import { AddNameRow } from "@/components/categories/add-name-row";
import { CategoryGroupRows } from "@/components/categories/category-group-rows";
import { ReassignCategoryDialog } from "@/components/categories/reassign-category-dialog";
import { useCategories } from "@/hooks/useCategories";
import { categoryCount, type DoomedCategory, movableGroups } from "@/lib/category-groups";
import { toCategoryOptions } from "@/lib/category-options";

export const Route = createFileRoute("/budgets/$budgetId/categories/")({
  component: CategoriesPage,
});

const DELETE_NOTE =
  "Deleting a category that has been budgeted to or spent from moves its transactions, schedules and budgeted amounts to a category you pick, after showing whether To Be Budgeted changes; hiding it from the budget grid keeps it instead. A group can be deleted once it holds no categories.";

function CategoriesPage() {
  const { budgetId } = Route.useParams();

  // A category and a group can share an id, so what is being renamed is keyed
  // by both.
  const [editing, setEditing] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<DoomedCategory | null>(null);

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

  const movable = movableGroups(groups);

  // A refusal names what it was made against, so changing subject drops it.
  function confirmDelete(next: DoomedCategory) {
    resetStatus();
    setDoomed(next);
  }

  function commitDelete(reassignToId?: number, acceptTbbChange?: boolean) {
    if (!doomed) return;
    setDoomed(null);
    if (doomed.kind === "category") remove(doomed.id, reassignToId, acceptTbbChange);
    else removeGroup(doomed.id);
  }

  if (isLoading) {
    return <CenteredMessage className="h-full">Loading categories…</CenteredMessage>;
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Categories"
        subtitle={`${categoryCount(groups)} categories in ${groups.length} groups`}
      />

      <div className="px-6 py-3 border-b border-border bg-accent/20">
        <AddNameRow
          placeholder="New group"
          ariaLabel="New group name"
          label={isCreatingGroup ? "Adding…" : "Add group"}
          isPending={isCreatingGroup}
          onAdd={createGroup}
        />
        <p className="mt-2 text-xs text-muted-foreground">{DELETE_NOTE}</p>
      </div>

      <ErrorList
        messages={[
          createError,
          renameError,
          deleteError,
          moveError,
          reorderError,
          createGroupError,
          renameGroupError,
          deleteGroupError,
          reorderGroupsError,
        ]}
      />

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {groups.map((group) => (
              <CategoryGroupRows
                key={group.id}
                group={group}
                movable={movable}
                editing={editing}
                onEdit={setEditing}
                isReordering={isReordering}
                isCreating={isCreating}
                onReorderGroups={reorderGroups}
                onRenameGroup={renameGroup}
                onReorder={reorder}
                onRename={rename}
                onMove={move}
                onCreate={create}
                onDelete={confirmDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Hiding a category can be undone from the grid; deleting one cannot.
          Mounted only while asking, so it closes at once rather than animating. */}
      {doomed?.kind === "category" && (doomed.used ?? 0) > 0 ? (
        <ReassignCategoryDialog
          budgetId={Number(budgetId)}
          categoryId={doomed.id}
          name={doomed.name}
          options={toCategoryOptions(groups).filter((option) => option.id !== doomed.id)}
          onCancel={() => setDoomed(null)}
          onConfirm={commitDelete}
        />
      ) : doomed && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDoomed(null)}
          title={`Delete this ${doomed.kind}?`}
          description={
            doomed.kind === "group"
              ? `"${doomed.name}" holds no categories, so nothing is lost, but it cannot be brought back from here.`
              : `"${doomed.name}" has never been budgeted to or spent from, so nothing is lost, but it cannot be brought back from here.`
          }
          confirmLabel="Delete"
          onConfirm={() => commitDelete()}
        />
      )}
    </div>
  );
}

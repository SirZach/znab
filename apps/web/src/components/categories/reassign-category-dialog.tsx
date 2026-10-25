import { useState } from "react";
import { CategoryPicker } from "@/components/common/category-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { CategoryOption } from "@/lib/category-options";
import { describeTbbChanges } from "@/lib/tbb-impact";
import { trpc } from "@/trpc";

/**
 * Deleting a category that has history, the YNAB 4 way: its transactions,
 * schedules and budgeted amounts move to the category picked here. Merging an
 * overspent category into one with money can move To Be Budgeted, so once a
 * target is picked the dialog previews that and, if anything changes, asks for
 * an explicit "I understand" before the delete is allowed. Mount it only while
 * asking, so the pick starts empty each time.
 */
export function ReassignCategoryDialog({
  budgetId,
  categoryId,
  name,
  options,
  onCancel,
  onConfirm,
}: {
  budgetId: number;
  categoryId: number;
  name: string;
  options: CategoryOption[];
  onCancel: () => void;
  onConfirm: (reassignToId: number, acceptTbbChange: boolean) => void;
}) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [understood, setUnderstood] = useState(false);

  const preview = trpc.category.reassignPreview.useQuery(
    { budgetId, categoryId, reassignToId: targetId ?? 0 },
    // Never answered from an earlier dialog's cache: the budget may have moved.
    { enabled: targetId !== null, gcTime: 0 }
  );
  const impact = preview.data
    ? describeTbbChanges(preview.data.changes, preview.data.throughMonth)
    : [];
  const ready =
    targetId !== null &&
    preview.isSuccess &&
    !preview.isFetching &&
    (impact.length === 0 || understood);

  function pick(id: number) {
    setTargetId(id);
    // Consent covers the impact of one target, not whichever is picked next.
    setUnderstood(false);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this category?</DialogTitle>
          <DialogDescription>
            "{name}" has been budgeted to or spent from. Its transactions, scheduled transactions
            and budgeted amounts will move to the category you pick. Hiding it instead keeps it as
            it is.
          </DialogDescription>
        </DialogHeader>
        <CategoryPicker options={options} categoryId={targetId} onChange={pick} />

        {targetId !== null && (
          <div className="space-y-2 text-sm">
            {preview.isPending && <p className="text-muted-foreground">Checking To Be Budgeted…</p>}
            {preview.isError && <p className="text-destructive">{preview.error.message}</p>}
            {preview.isSuccess && impact.length === 0 && <p>To Be Budgeted is unchanged.</p>}
            {impact.length > 0 && (
              <>
                <p>This changes To Be Budgeted by:</p>
                <ul className="list-disc pl-5">
                  {impact.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            {preview.data?.crossesMasterBudgets && (
              <p className="text-muted-foreground">
                The two categories are on different sides of the Master Budgets, so the household
                split will shift.
              </p>
            )}
            {impact.length > 0 && (
              <Label className="font-normal cursor-pointer">
                <Checkbox checked={understood} onCheckedChange={setUnderstood} />I understand
              </Label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!ready}
            onClick={() => targetId !== null && onConfirm(targetId, impact.length > 0)}
          >
            Move and delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

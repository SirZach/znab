/**
 * Which selected rows a bulk action writes, and what it says it did. Pure, so
 * the counts in the note always match the rows that were sent.
 */

export type BulkPlan<Row> = { targets: Row[]; note: string };

/**
 * Set one category on every selected row that can hold one. A split's
 * categories belong to its parts and a transfer between two budgeted accounts
 * carries none, so those rows are counted and left alone rather than sent a
 * change that would be refused.
 */
export function planBulkCategorise<Row>(
  rows: readonly Row[],
  canCategorise: (row: Row) => boolean
): BulkPlan<Row> {
  const targets = rows.filter(canCategorise);
  const skipped = rows.length - targets.length;
  return {
    targets,
    note:
      `Categorised ${targets.length} of ${rows.length}.` +
      (skipped > 0 ? ` ${skipped} carry no category here and were left alone.` : ""),
  };
}

/**
 * Tick every selected row off, or untick it. Rows already where they are being
 * asked to go are nothing to write, and a reconciled one is refused by the API
 * rather than moved back, so both are counted out of the pass.
 */
export function planBulkCleared<Row extends { cleared: string }>(
  rows: readonly Row[],
  target: "Cleared" | "Uncleared"
): BulkPlan<Row> {
  const locked = rows.filter((row) => row.cleared === "Reconciled");
  const targets = rows.filter((row) => row.cleared !== "Reconciled" && row.cleared !== target);
  return {
    targets,
    note:
      `Marked ${targets.length} of ${rows.length} ${target.toLowerCase()}.` +
      (locked.length > 0
        ? ` ${locked.length} are reconciled, which cannot be undone from the register.`
        : ""),
  };
}

/** Written as the deletes go out, before any of them has come back. */
export const bulkDeleteNote = (count: number) => `Deleting ${count}.`;

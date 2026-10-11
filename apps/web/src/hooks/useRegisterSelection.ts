import { useEffect, useState } from "react";
import {
  emptySelection,
  type RowSelection,
  type SelectModifiers,
  selectRows,
} from "@/lib/row-selection";

/**
 * The rows picked for a bulk action, and what the last one did. The selection
 * is resolved against `rows`, what is actually on screen, rather than held as
 * ids alone: a row that has been deleted, or that the cleared filter has taken
 * away, stops counting as selected on its own, which is what closes the panel
 * once a bulk delete has really happened and leaves it open, against the rows
 * that survived, when one was refused.
 */
export function useRegisterSelection<Row extends { id: number }>(rows: readonly Row[]) {
  const [selection, setSelection] = useState<RowSelection<number>>(emptySelection);
  /** What the last bulk action did, including the rows it would not touch. */
  const [note, setNote] = useState<string | null>(null);

  // Escape is the way out of a selection from the keyboard, since a plain click
  // no longer opens a row while one is held. A dialog or a picker takes Escape
  // for itself, so backing out of the delete confirmation does not also throw
  // away the selection it was about. The setters are stable, so this listens
  // once rather than reattaching as the selection changes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest("[role=dialog]")) return;
      setSelection(emptySelection());
      setNote(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    selectedRows: rows.filter((r) => selection.ids.has(r.id)),
    isSelected: (id: number) => selection.ids.has(id),
    note,
    setNote,
    /** Every row on screen in order, so a shift-click range and the register agree. */
    select(modifiers: SelectModifiers, id: number) {
      setNote(null);
      const visibleIds = rows.map((r) => r.id);
      setSelection((prev) => selectRows(prev, id, visibleIds, modifiers));
    },
    clear() {
      setSelection(emptySelection());
      setNote(null);
    },
  };
}

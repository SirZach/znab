import { useCallback, useState } from "react";
import { parseIdSet } from "@/lib/budget-grid";

/**
 * Which category groups are rolled up, remembered per budget so the shape of
 * the grid survives a reload. Browser storage can be unavailable or full, and
 * this is only a convenience, so every access is guarded.
 */
export function useCollapsedGroups(budgetId: number) {
  const storageKey = `znab:collapsed-groups:${budgetId}`;

  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try {
      return parseIdSet(localStorage.getItem(storageKey));
    } catch {
      return new Set<number>();
    }
  });

  const toggleGroup = useCallback(
    (groupId: number) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(groupId)) next.add(groupId);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // Not worth surfacing. The grid still works, it just won't remember.
        }
        return next;
      });
    },
    [storageKey]
  );

  return { collapsed, toggleGroup };
}

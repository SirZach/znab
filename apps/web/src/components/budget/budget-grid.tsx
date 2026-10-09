import { Fragment, useCallback, useRef, useState } from "react";
import { CategoryInspector } from "@/components/budget/category-inspector";
import { BulkBudgetPanel } from "@/components/budget/bulk-budget-panel";
import { CenteredMessage } from "@/components/common/centered-message";
import { useBudgetPage } from "@/hooks/useBudgetPage";
import { useCollapsedGroups } from "@/hooks/useCollapsedGroups";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  bulkRows,
  findCategory,
  liveCategories,
  monthNav,
  moveSources,
  visibleCategoryIds,
} from "@/lib/budget-grid";
import { emptySelection, selectRows, type RowSelection } from "@/lib/row-selection";
import { cn, monthParamToDate } from "@/lib/utils";
import { BudgetCategoryRow } from "./budget-category-row";
import { BudgetGroupHeader } from "./budget-group-header";
import { BudgetMonthNav } from "./budget-month-nav";
import { BudgetSummary } from "./budget-summary";
import { NAME_COL } from "./grid-styles";
import { HiddenCategoryRows } from "./hidden-category-rows";

/** One month of the budget: summary, category grid and the selection's panel. */
export function BudgetGrid({
  budgetId,
  month,
  onMonthChange,
}: {
  budgetId: number;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const dbMonth = monthParamToDate(month); // "YYYY-MM-01"

  const {
    visibleGroups,
    hidden,
    summary,
    isLoading,
    setBudgeted,
    moveMoney,
    setConfined,
    setCategoryGoal,
    setCategoryHidden,
    isMoving,
    moveError,
  } = useBudgetPage({ budgetId, month: dbMonth });
  const [showHidden, setShowHidden] = useState(false);
  const { collapsed, toggleGroup } = useCollapsedGroups(budgetId);
  const [selection, setSelection] = useState<RowSelection<number>>(emptySelection);
  const selectedIds = selection.ids;
  // Whether the inspector lists the transactions behind Spent rather than the
  // category's own controls. Clicking a Spent figure turns it on; selecting a
  // row any other way goes back to the controls.
  const [showSpent, setShowSpent] = useState(false);
  // A phone has no hover, no modifier keys and no room beside the grid, so
  // there the grid is for reading, and a tapped category opens full screen.
  const isMobile = useIsMobile();

  const visibleRowIds = visibleCategoryIds(visibleGroups, collapsed);

  // One selected category opens the inspector; several open the bulk panel.
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0]! : null;

  // Resolved fresh each render so the panel follows the month and any edits
  // made from inside it.
  const selected = findCategory(visibleGroups, selectedId);

  function clearSelection() {
    setSelection((prev) => ({ ids: new Set(), anchor: prev.anchor }));
  }

  function selectRow(event: React.MouseEvent, id: number) {
    setShowSpent(false);
    if (isMobile) {
      setSelection((prev) => ({ ids: new Set([id]), anchor: prev.anchor }));
      return;
    }
    setSelection((prev) => selectRows(prev, id, visibleRowIds, event));
  }

  // Budget cells register themselves so arrow keys can hand focus along without
  // the grid having to own every input's state.
  const cellRefs = useRef(new Map<number, HTMLInputElement>());
  const registerCell = useCallback((id: number, el: HTMLInputElement | null) => {
    if (el) cellRefs.current.set(id, el);
    else cellRefs.current.delete(id);
  }, []);

  function moveFocus(fromId: number, delta: number) {
    const index = visibleRowIds.indexOf(fromId);
    if (index === -1) return;
    const target = visibleRowIds[index + delta];
    if (target === undefined) return; // first or last cell: stay put
    const el = cellRefs.current.get(target);
    if (el) {
      el.focus();
      el.select();
    }
  }

  function budgetSelected(amount: number) {
    for (const id of selectedIds) setBudgeted(id, amount);
  }

  const { prevMonth, nextMonth, displayMonth, monthShort, prevShort } = monthNav(dbMonth);

  if (isLoading) {
    return <CenteredMessage className="h-full">Loading budget…</CenteredMessage>;
  }

  return (
    // Fills what the shell leaves, which on a phone is less the top bar above
    // Kept to a centered reading width on a wide screen, so the eye does not
    // travel far from a category's name to its numbers
    <div className="flex flex-col flex-1 min-h-0 w-full md:max-w-5xl md:mx-auto md:border-x md:border-border">
      {/* Month nav + summary header */}
      <div className="px-3 py-3 md:px-6 md:py-4 border-b border-border space-y-3 md:space-y-4">
        <BudgetMonthNav
          displayMonth={displayMonth}
          onPrev={() => onMonthChange(prevMonth)}
          onNext={() => onMonthChange(nextMonth)}
        />
        {summary && (
          <BudgetSummary summary={summary} monthShort={monthShort} prevShort={prevShort} />
        )}
      </div>

      {/* Budget table, with the selected category's panel alongside */}
      <div className="flex-1 flex min-h-0">
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr className="text-muted-foreground">
              <th className={cn("text-left px-3 md:px-6 py-2 font-medium", NAME_COL)}>Category</th>
              <th className="text-right px-2 md:px-4 py-2 font-medium w-16 md:w-32">Budgeted</th>
              <th className="text-right px-2 md:px-4 py-2 font-medium w-16 md:w-32">Spent</th>
              <th className="text-right px-3 md:px-6 py-2 font-medium w-20 md:w-32">Available</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => {
              const cats = liveCategories(group.categories);
              const isCollapsed = collapsed.has(group.id);

              return (
                <Fragment key={group.id}>
                  <BudgetGroupHeader
                    name={group.name}
                    categories={cats}
                    collapsed={isCollapsed}
                    onToggle={() => toggleGroup(group.id)}
                  />
                  {!isCollapsed &&
                    cats.map((cat) => (
                      <BudgetCategoryRow
                        key={cat.id}
                        cat={cat}
                        selected={selectedIds.has(cat.id)}
                        isMobile={isMobile}
                        onSelect={(e) => selectRow(e, cat.id)}
                        onShowSpent={() => {
                          setSelection({ ids: new Set([cat.id]), anchor: cat.id });
                          setShowSpent(true);
                        }}
                        registerCell={registerCell}
                        onMoveFocus={(delta) => moveFocus(cat.id, delta)}
                        onBudget={(val) => setBudgeted(cat.id, val)}
                      />
                    ))}
                </Fragment>
              );
            })}

            {hidden.length > 0 && (
              <HiddenCategoryRows
                key="hidden"
                hidden={hidden}
                open={showHidden}
                onToggle={() => setShowHidden((v) => !v)}
                onUnhide={(id) => setCategoryHidden(id, false)}
              />
            )}
          </tbody>
        </table>
      </div>

        {selected && (
          <CategoryInspector
            // Keyed so the panel's own drafts, the move direction and the goal
            // editor, reset when a different category is selected rather than
            // carrying the previous one's values over.
            key={selected.id}
            budgetId={budgetId}
            month={dbMonth}
            category={{
              id: selected.id,
              name: selected.name,
              groupName: selected.groupName,
              budgeted: selected.budgeted,
              activity: selected.activity,
              available: selected.available,
              overspendKind: selected.overspendKind,
              confined: selected.confined,
              goal: selected.goal,
            }}
            sources={moveSources(visibleGroups, selectedId)}
            onSetBudgeted={(amount) => setBudgeted(selected.id, amount)}
            onMoveMoney={(otherCategoryId, amount, direction) =>
              moveMoney(
                direction === "in"
                  ? { fromCategoryId: otherCategoryId, toCategoryId: selected.id, amount }
                  : { fromCategoryId: selected.id, toCategoryId: otherCategoryId, amount }
              )
            }
            onSetConfined={(confined) => setConfined(selected.id, confined)}
            onSetGoal={(goal) => setCategoryGoal(selected.id, goal)}
            onHide={() => {
              setCategoryHidden(selected.id, true);
              clearSelection();
            }}
            isMoving={isMoving}
            moveError={moveError}
            showSpent={showSpent}
            onShowSpent={setShowSpent}
            onClose={clearSelection}
            readOnly={isMobile}
          />
        )}

        {/* Desktop only: a phone cannot multi-select, and has no room for it */}
        {!isMobile && selectedIds.size > 1 && (
          <BulkBudgetPanel
            categories={bulkRows(visibleGroups, selectedIds)}
            onBudgetAll={budgetSelected}
            onClear={clearSelection}
          />
        )}
      </div>
    </div>
  );
}

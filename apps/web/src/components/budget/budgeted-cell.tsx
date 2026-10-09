import { useRef, useState } from "react";
import { adjustAmount, cn, parseAmountExpression } from "@/lib/utils";
import { AdjustButton } from "./adjust-button";

/**
 * A budgeted amount, editable in place. Accepts arithmetic the way YNAB 4 does
 * such as `25+13` or `120/3`, so it is a text field rather than a number one, which
 * would reject the operators as you typed them.
 */
export function BudgetedCell({
  categoryId,
  value,
  onSave,
  onMove,
  registerRef,
}: {
  categoryId: number;
  value: number;
  onSave: (val: number) => void;
  onMove: (delta: number) => void;
  registerRef: (id: number, el: HTMLInputElement | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  // The same cell is reused as you move between months, so outside an edit it
  // shows the value it is given. While someone is mid-edit, their draft wins.
  const shown = editing ? draft : value.toFixed(2);

  // Which +/- popup, if any, is open. Kept here rather than in each popup so
  // the hover affordances know to stay visible while one of them is open.
  const [adjusting, setAdjusting] = useState<"+" | "-" | null>(null);

  // Whether this cell has been typed into since it was last committed. Arrow
  // keys commit and then move focus, which fires blur and would otherwise
  // commit the same amount a second time.
  const dirty = useRef(false);

  function commit() {
    setEditing(false);
    if (!dirty.current) return; // nothing typed, so nothing to save
    dirty.current = false;

    const parsed = parseAmountExpression(draft);
    if (parsed === null) return; // unreadable, so leave the amount as it was
    if (parsed !== value) onSave(parsed);
  }

  // Adjust what the cell is showing. Reaching for one of these buttons blurs
  // the input, which commits anything typed there.
  function applyAdjustment(op: "+" | "-", typed: string) {
    setAdjusting(null);
    const next = adjustAmount(parseAmountExpression(shown) ?? value, op, typed);
    if (next === null) return; // unreadable, so leave the amount as it was
    onSave(next);
  }

  return (
    <div className="relative inline-block group">
      {/* Out of the flow entirely, over the empty left of a right-aligned
          amount, so appearing cannot shift the figure by a pixel and cannot
          reach into the category beside it. Hidden rather than transparent,
          since a transparent button still swallows the clicks meant for the
          amount underneath it. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute inset-y-0 left-0 z-10 flex items-center gap-0.5 invisible",
          "group-hover:visible group-focus-within:visible",
          adjusting && "visible"
        )}
      >
        <AdjustButton
          op="+"
          open={adjusting === "+"}
          onOpenChange={(open) => setAdjusting(open ? "+" : null)}
          onApply={(typed) => applyAdjustment("+", typed)}
        />
        <AdjustButton
          op="-"
          open={adjusting === "-"}
          onOpenChange={(open) => setAdjusting(open ? "-" : null)}
          onApply={(typed) => applyAdjustment("-", typed)}
        />
      </div>
      <input
        ref={(el) => registerRef(categoryId, el)}
        type="text"
        inputMode="decimal"
        aria-label="Budgeted amount"
        value={shown}
        onFocus={(e) => {
          setDraft(value.toFixed(2));
          setEditing(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          // Typing can follow a commit without leaving the field (Enter on the
          // last cell), so a keystroke always resumes editing.
          dirty.current = true;
          setEditing(true);
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter and the arrows all commit and hand focus to the neighbouring
          // cell, so a whole month can be budgeted without reaching for a mouse.
          if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            commit();
            onMove(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            commit();
            onMove(-1);
          } else if (e.key === "Escape") {
            dirty.current = false;
            setEditing(false);
            e.currentTarget.blur();
          }
        }}
        className="w-24 text-right bg-transparent focus:bg-accent rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring tabular-nums"
      />
    </div>
  );
}

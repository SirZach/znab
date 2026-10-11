import { ChevronLeft, ChevronRight } from "lucide-react";

/** The month's name between previous and next arrows. */
export function BudgetMonthNav({
  displayMonth,
  onPrev,
  onNext,
}: {
  displayMonth: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={20} />
      </button>
      <h2 className="text-lg font-semibold">{displayMonth}</h2>
      <button
        type="button"
        onClick={onNext}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

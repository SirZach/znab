import { format, parseISO } from "date-fns";
import { monthsByYear } from "@/lib/budget-grid";
import { currentMonthParam, dateToMonthParam } from "@/lib/utils";

/** Shown when the budget is opened with no month chosen. */
export function MonthPicker({
  months,
  onSelect,
}: {
  months: string[];
  onSelect: (month: string) => void;
}) {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Select a Month</h2>
        <p className="text-muted-foreground mt-1">
          Or{" "}
          <button
            type="button"
            onClick={() => onSelect(currentMonthParam())}
            className="text-primary underline-offset-2 hover:underline"
          >
            go to current month
          </button>
        </p>
      </div>

      <div className="space-y-6">
        {monthsByYear(months).map(([year, ms]) => (
          <div key={year}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {year}
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {ms.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => onSelect(dateToMonthParam(m))}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary hover:bg-accent transition-colors text-center"
                >
                  {format(parseISO(m), "MMM")}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

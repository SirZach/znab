import { formatCurrency } from "@/lib/utils";

/** A month ("YYYY-MM") whose To Be Budgeted a category reassignment moves. */
export type TbbChange = { month: string; delta: number };

/** "2026-02" as "Feb 2026". */
export function formatMonthYear(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * The changes in plain words, one line per run of consecutive months that move
 * by the same amount: "+$50.00 from Feb 2026" when the run lasts through
 * `throughMonth`, otherwise "+$50.00 in Feb 2026" or "... from Feb 2026 to Apr
 * 2026". Empty when nothing changes.
 */
export function describeTbbChanges(changes: readonly TbbChange[], throughMonth: string): string[] {
  const runs: { from: string; to: string; delta: number }[] = [];
  for (const { month, delta } of changes) {
    const last = runs.at(-1);
    if (last && last.delta === delta && nextMonth(last.to) === month) last.to = month;
    else runs.push({ from: month, to: month, delta });
  }
  return runs.map(({ from, to, delta }) => {
    const amount = `${delta > 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`;
    if (to === throughMonth) return `${amount} from ${formatMonthYear(from)}`;
    if (from === to) return `${amount} in ${formatMonthYear(from)}`;
    return `${amount} from ${formatMonthYear(from)} to ${formatMonthYear(to)}`;
  });
}

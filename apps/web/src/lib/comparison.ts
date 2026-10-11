import type { ComparisonPeriod } from "@znab/shared";

/** This month as "YYYY-MM", or this year as "YYYY". */
export function currentAnchor(period: ComparisonPeriod, now: Date = new Date()): string {
  const year = String(now.getFullYear());
  return period === "year" ? year : `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** The anchor `delta` months or years away. */
export function stepAnchor(period: ComparisonPeriod, anchor: string, delta: number): string {
  if (period === "year") return String(Number(anchor) + delta);
  const [year, month] = anchor.split("-").map(Number) as [number, number];
  return currentAnchor("month", new Date(year, month - 1 + delta, 1));
}

/**
 * A half-open range as a reader names it: "March 2026" or "2025" when it is a
 * whole month or year, and "Oct 1 to 11, 2026" when it runs to date.
 */
export function rangeLabel(
  range: { start: string; end: string },
  period: ComparisonPeriod,
  toDate: boolean
): string {
  const start = civil(range.start);
  if (!toDate) {
    return period === "year"
      ? String(start.getFullYear())
      : start.toLocaleString("en-US", { month: "long", year: "numeric" });
  }
  const end = civil(range.end);
  end.setDate(end.getDate() - 1);
  const short = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric" });
  const last = end.getMonth() === start.getMonth() ? String(end.getDate()) : short(end);
  return `${short(start)} to ${last}, ${end.getFullYear()}`;
}

function civil(date: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

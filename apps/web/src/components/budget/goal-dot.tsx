import { cn, formatCurrency } from "@/lib/utils";

/**
 * A small ring on any category carrying a goal, filled to its progress, so the
 * grid shows which envelopes are behind without opening each one.
 */
export function GoalDot({
  goal,
}: {
  goal: { percent: number; underFunded: number; neededThisMonth: number };
}) {
  const pct = Math.round(goal.percent * 100);
  const behind = goal.underFunded > 0;

  return (
    <span
      title={
        behind
          ? `Goal ${pct}% funded, ${formatCurrency(goal.underFunded)} short this month`
          : `Goal ${pct}% funded, on track`
      }
      role="img"
      aria-label={`Goal ${pct} percent funded`}
      className={cn(
        "inline-block size-2 rounded-full shrink-0",
        behind ? "bg-amber-500" : "bg-green-600 dark:bg-green-500"
      )}
    />
  );
}

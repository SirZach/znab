/**
 * Whether the household split settings can be saved: two different budgets, and
 * a savings percent typed in and between 0 and 100.
 */
export function validSplitSettings({
  primaryId,
  partnerId,
  percent,
}: {
  primaryId: number | null;
  partnerId: number | null;
  percent: string;
}) {
  const value = Number(percent);
  return (
    primaryId !== null &&
    partnerId !== null &&
    primaryId !== partnerId &&
    percent.trim() !== "" &&
    value >= 0 &&
    value <= 100
  );
}

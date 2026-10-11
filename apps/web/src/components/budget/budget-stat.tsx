/** One signed figure + caption in the Available-to-Budget breakdown. */
export function BudgetStat({
  label,
  text,
  danger,
  warn,
}: {
  label: string;
  text: string;
  danger?: boolean;
  warn?: boolean;
}) {
  const color = warn ? "text-amber-500" : danger ? "text-destructive" : "text-foreground";
  return (
    <div className="flex flex-col items-end justify-center">
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{text}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

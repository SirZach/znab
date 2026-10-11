/**
 * What every report chart shares: the series colors (theme tokens in
 * `styles/globals.css`), the axis, grid and tooltip styling, and the tick
 * formatters.
 */

export const CHART_COLORS = {
  blue: "var(--chart-1)",
  red: "var(--chart-2)",
  green: "var(--chart-3)",
  purple: "var(--chart-4)",
  /** The net line drawn over the bars or areas. */
  line: "hsl(var(--foreground))",
} as const;

/** Spread onto `CartesianGrid`, with `vertical` or `horizontal` turned off. */
export const chartGridProps = { strokeDasharray: "3 3", stroke: "hsl(var(--border))" } as const;

/** Spread onto `XAxis` and `YAxis`. */
export const chartAxisProps = {
  tick: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
  stroke: "hsl(var(--border))",
} as const;

/** The `contentStyle` of a `Tooltip`. */
export const chartTooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;

/** A dollar amount short enough for a chart axis: "$1.2K". */
export function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** "YYYY-MM" -> "MMM 'YY", for a chart axis. */
export function formatMonthTick(month: string): string {
  const [year = "", m = ""] = month.split("-");
  const label = new Date(Number(year), Number(m) - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
  return `${label} '${year.slice(2)}`;
}

/**
 * The server's local calendar date as "YYYY-MM-DD". Budgets live on calendar
 * days, so "today" has to be the server's local day: `toISOString()` gives the
 * UTC day, which in a US evening is already tomorrow.
 */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

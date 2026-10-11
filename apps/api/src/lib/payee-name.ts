/**
 * A payee name as typed, made ready to store: trimmed, or null when nothing is
 * left. Typing an existing name with stray spaces should land on that payee
 * rather than create a second one.
 */
export function normalizePayeeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * The key two payee names are compared by: trimmed and lower cased, the way
 * `payee.rename` checks for a clash. The SQL side applies `lower(trim(name))`.
 */
export function payeeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

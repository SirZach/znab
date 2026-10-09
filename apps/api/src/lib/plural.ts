/** `one` or `many` for a count, defaulting the plural to `one` plus "s". */
export const pluralize = (n: number, one: string, many = `${one}s`): string =>
  n === 1 ? one : many;

/** A count and its noun, as in "1 transaction" or "3 transactions". */
export const countOf = (n: number, one: string, many?: string): string =>
  `${n} ${pluralize(n, one, many)}`;

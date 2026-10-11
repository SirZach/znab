import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * `column IN (...values)` for a CHECK constraint. A CHECK cannot take bind
 * parameters, so the values are inlined; they are code constants, never input.
 * A null passes, as it does for any CHECK, so nullability stays the column's.
 */
export function oneOf(column: PgColumn, values: readonly string[]): SQL {
  return sql`${column} IN (${sql.raw(values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", "))})`;
}

/** YNAB 4's category and master category types. */
export const CATEGORY_TYPES = ["OUTFLOW", "INFLOW"] as const;

/** A monthly budget row's overspending flag; null means "same as last month". */
export const OVERSPENDING_HANDLING = ["Confined", "AffectsBuffer"] as const;

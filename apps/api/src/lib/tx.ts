import type { db } from "@znab/db";

/** The handle inside `db.transaction`, for helpers that write as part of one. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

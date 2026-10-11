import { z } from "zod";

/** A calendar date as "YYYY-MM-DD". Months are passed as their first day. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

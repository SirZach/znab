import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { auditLog } from "@znab/db";
import { AUDIT_ENTITIES } from "../lib/audit";
import { router, budgetProcedure } from "../trpc";

export const auditRouter = router({
  // The budget's change history, newest first, optionally narrowed to one row.
  // Paged the way the register is: one row past the page says there is more.
  list: budgetProcedure
    .input(
      z.object({
        entity: z.enum(AUDIT_ENTITIES).optional(),
        entityId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.budgetId, input.budgetId),
            input.entity !== undefined ? eq(auditLog.entity, input.entity) : undefined,
            input.entityId !== undefined ? eq(auditLog.entityId, input.entityId) : undefined
          )
        )
        // A write's rows share one `created_at`, the transaction's start, so
        // the id keeps them in the order they were written.
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(input.limit + 1)
        .offset(input.offset);

      const hasMore = rows.length > input.limit;
      return { entries: hasMore ? rows.slice(0, input.limit) : rows, hasMore };
    }),
});

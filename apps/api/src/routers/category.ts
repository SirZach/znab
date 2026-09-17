import { z } from "zod";
import { eq, and, count, isNull, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { db } from "@znab/db";
import { categories, categoryGroups, payees } from "@znab/db";
import { categoryNameSchema } from "@znab/shared";
import { assertBudgetAccess, ownedBudgetIds, type AuthedContext } from "../lib/authz";
import { mintCategoryGroupYnabId, mintCategoryYnabId } from "../lib/category";

/** The handle inside `db.transaction`, for the helpers the writes below share. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The name a write is given, refused when it is nothing but whitespace. */
function cleanName(name: string, what: "Category" | "Category group"): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${what} name cannot be empty` });
  }
  return trimmed;
}

/**
 * Refuses a write aimed at one of YNAB 4's own groups. Hidden Categories,
 * Income, __Internal__ and Pre-YNAB Debt are the budget's own bookkeeping
 * rather than the user's envelopes: the grid never shows them, the export
 * marks them as not deletable, and the importer recreates them by id, so
 * renaming one, deleting one, or filing a category under one would be either
 * undone or invisible.
 */
function assertUserGroup(group: { name: string; isSystem: boolean }) {
  if (group.isSystem) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `"${group.name}" is one of the budget's own groups, which YNAB 4 keeps for itself. Use a group of your own.`,
    });
  }
}

/**
 * Refuses anything but the complete set, in any order. A partial order would
 * leave what it left out sitting wherever it was, which is how two rows come to
 * claim the same place.
 */
function assertExactly(sent: number[], live: Set<number>, what: string) {
  const unique = new Set(sent);
  if (
    unique.size !== sent.length ||
    unique.size !== live.size ||
    sent.some((id) => !live.has(id))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The new order has to name each of the ${live.size} ${what} exactly once. Reload the page and try again.`,
    });
  }
}

/**
 * Reads one category of the budget, locked for the rest of the transaction.
 * Hidden categories are found as well: hiding is a soft delete the user can
 * undo, so a hidden category is still a row they can rename, refile or delete
 * for good, and an unused one — the only kind a delete can reach — has usually
 * been hidden already.
 */
async function lockCategory(
  tx: Tx,
  ctx: AuthedContext,
  categoryId: number,
  budgetId: number
) {
  const [row] = await tx
    .select({
      category: categories,
      groupName: categoryGroups.name,
      groupIsSystem: categoryGroups.isSystem,
    })
    .from(categories)
    .innerJoin(categoryGroups, eq(categoryGroups.id, categories.groupId))
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.budgetId, budgetId),
        inArray(categories.budgetId, ownedBudgetIds(ctx))
      )
    )
    .for("update", { of: [categories] });
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
  }
  // The group the category sits in now, not just the one it is headed for. A
  // category inside one of YNAB 4's own groups is the budget's bookkeeping:
  // "Inflow: Ready to Assign" and "Inflow: Next Month" are reached by their
  // ynab id rather than by row id, so nothing points at them and the usage
  // check below reads them as unused. Without this they could be renamed,
  // refiled or deleted outright.
  return {
    ...row.category,
    group: { name: row.groupName, isSystem: row.groupIsSystem },
  };
}

/** Reads one live group of the budget, locked for the rest of the transaction. */
async function lockGroup(tx: Tx, ctx: AuthedContext, groupId: number, budgetId: number) {
  const [group] = await tx
    .select({
      id: categoryGroups.id,
      name: categoryGroups.name,
      type: categoryGroups.type,
      isSystem: categoryGroups.isSystem,
    })
    .from(categoryGroups)
    .where(
      and(
        eq(categoryGroups.id, groupId),
        eq(categoryGroups.budgetId, budgetId),
        isNull(categoryGroups.deletedAt),
        inArray(categoryGroups.budgetId, ownedBudgetIds(ctx))
      )
    )
    .for("update");
  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Category group not found" });
  }
  return group;
}

/**
 * The place at the end of a group. Ranked over every category it holds, hidden
 * ones included, so a new arrival cannot land on top of one that is unhidden
 * later.
 */
async function endOfGroup(tx: Tx, groupId: number): Promise<number> {
  const [top] = await tx
    .select({ max: sql<number | null>`MAX(${categories.sortOrder})` })
    .from(categories)
    .where(eq(categories.groupId, groupId));
  return Number(top?.max ?? -1) + 1;
}

export const categoryRouter = router({
  // Category groups and their categories for a budget.
  //
  // Categories belong to the budget, not to a month — only their allocations
  // are month-scoped. Anything that just needs the list of envelopes (the
  // register's category picker, say) should read this rather than pull a
  // month's worth of budget data and discard the allocations.
  list: protectedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      // What points at each category, counted the way `remove` counts it, so a
      // screen can say up front which categories it may offer to delete rather
      // than offering them all and letting the refusal explain afterwards. One
      // grouped pass over each table rather than four subqueries a category,
      // the way the payee screen totals its usage: the alternative reads the
      // 19,317 transactions once per category instead of once.
      const [groups, usage] = await Promise.all([
        ctx.db.query.categoryGroups.findMany({
          where: and(
            eq(categoryGroups.budgetId, input.budgetId),
            isNull(categoryGroups.deletedAt)
          ),
          orderBy: (cg, { asc }) => [asc(cg.sortOrder)],
          columns: { id: true, name: true, isSystem: true },
          with: {
            categories: {
              where: (c, { isNull }) => isNull(c.deletedAt),
              orderBy: (c, { asc }) => [asc(c.sortOrder)],
              columns: { id: true, name: true },
            },
          },
        }),
        ctx.db.execute(sql`
          SELECT "categoryId", SUM(n)::int AS used FROM (
            SELECT category_id AS "categoryId", count(*) AS n
              FROM monthly_budgets WHERE category_id IS NOT NULL GROUP BY category_id
            UNION ALL
            SELECT category_id, count(*)
              FROM transactions WHERE category_id IS NOT NULL GROUP BY category_id
            UNION ALL
            SELECT category_id, count(*)
              FROM sub_transactions WHERE category_id IS NOT NULL GROUP BY category_id
            UNION ALL
            SELECT category_id, count(*)
              FROM scheduled_transactions WHERE category_id IS NOT NULL GROUP BY category_id
          ) x GROUP BY "categoryId"
        `) as unknown as Promise<{ categoryId: number; used: number }[]>,
      ]);

      const usedById = new Map(usage.map((r) => [Number(r.categoryId), Number(r.used)]));

      return groups.map((group) => ({
        ...group,
        categories: group.categories.map((category) => ({
          ...category,
          used: usedById.get(category.id) ?? 0,
        })),
      }));
    }),

  // A new category, at the end of the group it is filed under.
  create: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        groupId: z.number().int().positive(),
        name: categoryNameSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      const name = cleanName(input.name, "Category");

      return ctx.db.transaction(async (tx) => {
        const group = await lockGroup(tx, ctx, input.groupId, input.budgetId);
        assertUserGroup(group);

        const sortOrder = await endOfGroup(tx, group.id);
        const [category] = await tx
          .insert(categories)
          .values({
            ynabId: mintCategoryYnabId(),
            budgetId: input.budgetId,
            groupId: group.id,
            name,
            // Every imported category carries its group's type and nothing
            // about a category decides it for itself, so it is inherited.
            type: group.type,
            sortOrder,
          })
          .returning();

        return category!;
      });
    }),

  // Renaming a category. Only the name moves: what it has been budgeted and
  // spent hangs off its id, which is untouched.
  rename: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        name: categoryNameSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      const name = cleanName(input.name, "Category");

      return ctx.db.transaction(async (tx) => {
        const category = await lockCategory(tx, ctx, input.categoryId, input.budgetId);
        assertUserGroup(category.group);

        const [updated] = await tx
          .update(categories)
          .set({ name, updatedAt: new Date() })
          .where(
            and(
              eq(categories.id, category.id),
              inArray(categories.budgetId, ownedBudgetIds(ctx))
            )
          )
          .returning();

        return updated!;
      });
    }),

  // Deleting is only ever offered for a category nothing was ever filed under,
  // so that one entered by mistake can be taken back. A category with history
  // is hidden instead, which keeps every month it appears in intact — and that
  // is the whole difference between the two: hiding is the soft delete, this
  // takes the row away.
  remove: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        const category = await lockCategory(tx, ctx, input.categoryId, input.budgetId);
        assertUserGroup(category.group);

        // Everything that points at a category through a foreign key with no
        // ON DELETE behaviour, which is what Postgres would otherwise refuse
        // the delete over as a raw driver error. Counted without regard to
        // `deleted_at`, because a foreign key has none: a soft-deleted
        // transaction holds its category down exactly as a live one does.
        const [refs] = (await tx.execute(sql`
          SELECT
            (SELECT count(*) FROM monthly_budgets WHERE category_id = ${category.id})
          + (SELECT count(*) FROM transactions WHERE category_id = ${category.id})
          + (SELECT count(*) FROM sub_transactions WHERE category_id = ${category.id})
          + (SELECT count(*) FROM scheduled_transactions WHERE category_id = ${category.id})
            AS used
        `)) as unknown as { used: string }[];
        const used = Number(refs?.used ?? 0);

        if (used > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${category.name}" is still used by ${used} allocation${
              used === 1 ? "" : "s"
            } or transaction${
              used === 1 ? "" : "s"
            }. Hide it instead, which keeps its history in every month it belongs to.`,
          });
        }

        // A payee's autofill is that payee's own configuration rather than
        // history the way an allocation is — the same line payee.delete draws
        // around its rename rules — so it is cleared rather than standing in
        // the way of a category that was never used.
        await tx
          .update(payees)
          .set({ autofillCategoryId: null, updatedAt: new Date() })
          .where(
            and(
              eq(payees.autofillCategoryId, category.id),
              inArray(payees.budgetId, ownedBudgetIds(ctx))
            )
          );

        await tx
          .delete(categories)
          .where(
            and(
              eq(categories.id, category.id),
              inArray(categories.budgetId, ownedBudgetIds(ctx))
            )
          );

        return { id: category.id };
      });
    }),

  // Filing a category under another group, at the end of it. The month engine
  // keys off the category's id and never joins the groups, so nothing about
  // the budget's arithmetic moves with it; the grid resolves grouping when it
  // reads.
  move: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        groupId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        const category = await lockCategory(tx, ctx, input.categoryId, input.budgetId);
        assertUserGroup(category.group);
        const group = await lockGroup(tx, ctx, input.groupId, input.budgetId);
        assertUserGroup(group);

        // Dropped back where it came from, it stays where it is: moving it to
        // the end of its own group is a reorder nobody asked for.
        if (category.groupId === group.id) return category;

        const sortOrder = await endOfGroup(tx, group.id);
        const [updated] = await tx
          .update(categories)
          .set({
            groupId: group.id,
            // Inherited on the way in, so it is carried across on the way over.
            type: group.type,
            sortOrder,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(categories.id, category.id),
              inArray(categories.budgetId, ownedBudgetIds(ctx))
            )
          )
          .returning();

        return updated!;
      });
    }),

  // A group's order, sent whole. Hidden categories are left out: the grid
  // cannot show one, so the user cannot have placed it, and their stale places
  // only ever matter against each other.
  reorder: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        groupId: z.number().int().positive(),
        categoryIds: z.array(z.number().int().positive()).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        // The group is resolved and refused here like everywhere else, rather
        // than inferred from the ids. Nothing displays the order inside one of
        // YNAB 4's own groups, but a write that quietly works on them while
        // every neighbouring write refuses them is the kind of inconsistency
        // that later reads as permission.
        const group = await lockGroup(tx, ctx, input.groupId, input.budgetId);
        assertUserGroup(group);

        const live = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.groupId, input.groupId),
              eq(categories.budgetId, input.budgetId),
              isNull(categories.deletedAt),
              inArray(categories.budgetId, ownedBudgetIds(ctx))
            )
          )
          .for("update");

        assertExactly(
          input.categoryIds,
          new Set(live.map((c) => c.id)),
          "categories in this group"
        );

        // One statement a category, all inside the one transaction so that no
        // reader ever sees half an order.
        for (const [index, id] of input.categoryIds.entries()) {
          await tx
            .update(categories)
            .set({ sortOrder: index, updatedAt: new Date() })
            .where(
              and(
                eq(categories.id, id),
                inArray(categories.budgetId, ownedBudgetIds(ctx))
              )
            );
        }

        return { reordered: input.categoryIds.length };
      });
    }),

  // A new group of the user's own, at the end of the ones they already have.
  // YNAB 4's own sit past them all, so the end of the user's groups is the end
  // of the grid.
  createGroup: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        name: categoryNameSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      const name = cleanName(input.name, "Category group");

      return ctx.db.transaction(async (tx) => {
        const [top] = await tx
          .select({ max: sql<number | null>`MAX(${categoryGroups.sortOrder})` })
          .from(categoryGroups)
          .where(
            and(
              eq(categoryGroups.budgetId, input.budgetId),
              eq(categoryGroups.isSystem, false),
              isNull(categoryGroups.deletedAt)
            )
          );

        const [group] = await tx
          .insert(categoryGroups)
          .values({
            ynabId: mintCategoryGroupYnabId(),
            budgetId: input.budgetId,
            name,
            isSystem: false,
            sortOrder: Number(top?.max ?? -1) + 1,
          })
          .returning();

        return group!;
      });
    }),

  renameGroup: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        groupId: z.number().int().positive(),
        name: categoryNameSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      const name = cleanName(input.name, "Category group");

      return ctx.db.transaction(async (tx) => {
        const group = await lockGroup(tx, ctx, input.groupId, input.budgetId);
        assertUserGroup(group);

        const [updated] = await tx
          .update(categoryGroups)
          .set({ name, updatedAt: new Date() })
          .where(
            and(
              eq(categoryGroups.id, group.id),
              inArray(categoryGroups.budgetId, ownedBudgetIds(ctx))
            )
          )
          .returning();

        return updated!;
      });
    }),

  // Deleting an empty group. A category cannot be left without one, since
  // `group_id` is NOT NULL, so the categories go somewhere first and the group
  // follows — never the other way about.
  removeGroup: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        groupId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        const group = await lockGroup(tx, ctx, input.groupId, input.budgetId);
        assertUserGroup(group);

        // Hidden categories count. They keep their history and can be brought
        // back at any time, and the foreign key holds either way.
        const [held] = await tx
          .select({ value: count() })
          .from(categories)
          .where(eq(categories.groupId, group.id));
        const categoryCount = Number(held!.value);

        if (categoryCount > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${group.name}" still holds ${categoryCount} categor${
              categoryCount === 1 ? "y" : "ies"
            }, hidden ones included. Move them to another group, or delete them, first.`,
          });
        }

        await tx
          .delete(categoryGroups)
          .where(
            and(
              eq(categoryGroups.id, group.id),
              inArray(categoryGroups.budgetId, ownedBudgetIds(ctx))
            )
          );

        return { id: group.id };
      });
    }),

  // The grid's order of groups, sent whole. Only the user's own are placed:
  // YNAB 4's sit above 9000 so that they always follow, and letting one be
  // dragged in among the rest would put the budget's bookkeeping on screen.
  reorderGroups: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        groupIds: z.array(z.number().int().positive()).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      return ctx.db.transaction(async (tx) => {
        const live = await tx
          .select({ id: categoryGroups.id })
          .from(categoryGroups)
          .where(
            and(
              eq(categoryGroups.budgetId, input.budgetId),
              eq(categoryGroups.isSystem, false),
              isNull(categoryGroups.deletedAt),
              inArray(categoryGroups.budgetId, ownedBudgetIds(ctx))
            )
          )
          .for("update");

        assertExactly(input.groupIds, new Set(live.map((g) => g.id)), "category groups");

        for (const [index, id] of input.groupIds.entries()) {
          await tx
            .update(categoryGroups)
            .set({ sortOrder: index, updatedAt: new Date() })
            .where(
              and(
                eq(categoryGroups.id, id),
                inArray(categoryGroups.budgetId, ownedBudgetIds(ctx))
              )
            );
        }

        return { reordered: input.groupIds.length };
      });
    }),
});

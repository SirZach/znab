import { describe, expect, test } from "bun:test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { accounts, categories, categoryGroups } from "@znab/db";
import { expectTrpcError, withCaller } from "./harness";

describe("reorders write the whole order in one statement", () => {
  test("account.reorder", async () => {
    await withCaller(async ({ tx, seed, caller, other }) => {
      const { checking, savings, tracking, credit } = seed.accounts;
      const order = [credit.id, checking.id, tracking.id, savings.id];

      await expectTrpcError(
        caller.account.reorder({ budgetId: seed.budgetId, accountIds: order.slice(1) }),
        "BAD_REQUEST"
      );
      await expectTrpcError(
        caller.account.reorder({ budgetId: seed.budgetId, accountIds: [...order, other.accounts.checking.id] }),
        "BAD_REQUEST"
      );

      expect(await caller.account.reorder({ budgetId: seed.budgetId, accountIds: order })).toEqual({
        reordered: 4,
      });
      const rows = await tx.query.accounts.findMany({
        where: eq(accounts.budgetId, seed.budgetId),
        orderBy: [asc(accounts.sortOrder)],
      });
      expect(rows.map((a) => [a.id, a.sortOrder])).toEqual(order.map((id, i) => [id, i]));

      // The other budget's accounts never move.
      const theirs = await tx.query.accounts.findMany({ where: eq(accounts.budgetId, other.budgetId) });
      expect(theirs.map((a) => a.sortOrder).sort()).toEqual([0, 1, 2, 3]);
    });
  });

  test("category.reorder and category.reorderGroups", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const { rent, electric } = seed.categories;
      await caller.category.reorder({
        budgetId: seed.budgetId,
        groupId: seed.groups.bills.id,
        categoryIds: [electric.id, rent.id],
      });
      const cats = await tx.query.categories.findMany({
        where: and(eq(categories.groupId, seed.groups.bills.id), isNull(categories.deletedAt)),
        orderBy: [asc(categories.sortOrder)],
      });
      expect(cats.map((c) => [c.id, c.sortOrder])).toEqual([
        [electric.id, 0],
        [rent.id, 1],
      ]);

      const { bills, everyday } = seed.groups;
      await caller.category.reorderGroups({ budgetId: seed.budgetId, groupIds: [everyday.id, bills.id] });
      const groups = await tx.query.categoryGroups.findMany({
        where: and(eq(categoryGroups.budgetId, seed.budgetId), eq(categoryGroups.isSystem, false)),
        orderBy: [asc(categoryGroups.sortOrder)],
      });
      expect(groups.map((g) => [g.id, g.sortOrder])).toEqual([
        [everyday.id, 0],
        [bills.id, 1],
      ]);
      // YNAB 4's own groups keep their places past the user's.
      const hidden = await tx.query.categoryGroups.findFirst({
        where: eq(categoryGroups.id, seed.groups.hidden.id),
      });
      expect(hidden!.sortOrder).toBe(9000);
    });
  });
});

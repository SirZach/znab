import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { categories } from "@znab/db";
import { addIncome, expectTrpcError, withCaller } from "./harness";

// The findings asked for "remove with reassignment". The router has no
// reassignment: a category anything points at is refused with CONFLICT and the
// user is told to hide it instead. These tests pin that behaviour.
describe("category.remove", () => {
  test("refuses a used category and leaves the month untouched", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const { groceries } = seed.categories;
      await addIncome(tx, seed, 500, "2025-01-02");
      await caller.budget.setBudgeted({ budgetId: seed.budgetId, categoryId: groceries.id, month: "2025-01-01", budgeted: 80 });
      await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: groceries.id,
        amount: -30,
        date: "2025-01-05",
      });
      const before = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: "2025-01-01" });

      await expectTrpcError(caller.category.remove({ budgetId: seed.budgetId, categoryId: groceries.id }), "CONFLICT");

      expect(await tx.query.categories.findFirst({ where: eq(categories.id, groceries.id) })).toBeDefined();
      const after = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: "2025-01-01" });
      expect(after).toEqual(before);
    });
  });

  test("deletes an unused category without moving any month total", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await addIncome(tx, seed, 500, "2025-01-02");
      await caller.budget.setBudgeted({
        budgetId: seed.budgetId,
        categoryId: seed.categories.rent.id,
        month: "2025-01-01",
        budgeted: 400,
      });
      const before = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: "2025-01-01" });

      await caller.category.remove({ budgetId: seed.budgetId, categoryId: seed.categories.electric.id });

      expect(await tx.query.categories.findFirst({ where: eq(categories.id, seed.categories.electric.id) })).toBeUndefined();
      const after = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: "2025-01-01" });
      expect(after.summary).toEqual(before.summary);
    });
  });

  test("refuses a category in one of YNAB 4's system groups", async () => {
    await withCaller(async ({ seed, caller }) => {
      await expectTrpcError(
        caller.category.remove({ budgetId: seed.budgetId, categoryId: seed.categories.hiddenSystem.id }),
        "CONFLICT"
      );
    });
  });
});

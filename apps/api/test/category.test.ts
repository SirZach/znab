import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  auditLog,
  categories,
  categoryGroups,
  monthlyBudgets,
  payees,
  scheduledTransactions,
  subTransactions,
  transactions,
} from "@znab/db";
import { addIncome, expectTrpcError, withCaller, type Caller } from "./harness";

type Month = Awaited<ReturnType<Caller["budget"]["monthBudget"]>>;
const categoryOf = (month: Month, id: number) =>
  month.groups.flatMap((g) => g.categories).find((c) => c.id === id);

// A used category is refused unless a reassignment target is given, in which
// case everything filed under it moves there, as YNAB 4 does.
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

  test("reassigns transactions, splits, schedules, budgets and autofill to the target", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const { groceries, fun } = seed.categories;
      const { budgetId } = seed;
      await addIncome(tx, seed, 500, "2025-01-02");
      await caller.budget.setBudgeted({ budgetId, categoryId: groceries.id, month: "2025-01-01", budgeted: 80 });
      await caller.budget.setBudgeted({ budgetId, categoryId: groceries.id, month: "2025-02-01", budgeted: 20 });
      await caller.budget.setBudgeted({ budgetId, categoryId: fun.id, month: "2025-01-01", budgeted: 30 });
      const spend = await caller.transaction.create({
        budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: groceries.id,
        amount: -30,
        date: "2025-01-05",
      });
      const [parent] = await tx
        .insert(transactions)
        .values({
          ynabId: crypto.randomUUID(),
          budgetId,
          accountId: seed.accounts.checking.id,
          amount: "-10",
          date: "2025-01-06",
        })
        .returning();
      const [part] = await tx
        .insert(subTransactions)
        .values({ ynabId: crypto.randomUUID(), transactionId: parent!.id, categoryId: groceries.id, amount: "-10" })
        .returning();
      const scheduled = await caller.scheduledTransaction.create({
        budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: groceries.id,
        amount: -15,
        date: "2025-03-01",
        frequency: "Monthly",
      });
      await caller.payee.setAutofill({ budgetId, id: seed.payees.grocer.id, categoryId: groceries.id, memo: null });

      const jan = await caller.budget.monthBudget({ budgetId, month: "2025-01-01" });
      const feb = await caller.budget.monthBudget({ budgetId, month: "2025-02-01" });

      // Nothing was overspent, so To Be Budgeted cannot move and no flag is needed.
      const preview = await caller.category.reassignPreview({ budgetId, categoryId: groceries.id, reassignToId: fun.id });
      expect(preview.changes).toEqual([]);
      expect(preview.crossesMasterBudgets).toBe(false);
      expect((await tx.query.transactions.findFirst({ where: eq(transactions.id, spend!.id) }))?.categoryId).toBe(
        groceries.id
      );

      expect(
        await caller.category.remove({ budgetId, categoryId: groceries.id, reassignToId: fun.id })
      ).toEqual({ id: groceries.id, reassignedTo: fun.id });
      expect(
        (await tx.select().from(auditLog).where(eq(auditLog.budgetId, budgetId))).filter(
          (r) => r.entity === "monthly_budget" && r.action === "delete"
        )
      ).toHaveLength(2);

      expect(await tx.query.categories.findFirst({ where: eq(categories.id, groceries.id) })).toBeUndefined();
      expect((await tx.query.transactions.findFirst({ where: eq(transactions.id, spend!.id) }))?.categoryId).toBe(fun.id);
      expect((await tx.query.subTransactions.findFirst({ where: eq(subTransactions.id, part!.id) }))?.categoryId).toBe(
        fun.id
      );
      expect(
        (await tx.query.scheduledTransactions.findFirst({ where: eq(scheduledTransactions.id, scheduled.id) }))
          ?.categoryId
      ).toBe(fun.id);
      expect(
        (await tx.query.payees.findFirst({ where: eq(payees.id, seed.payees.grocer.id) }))?.autofillCategoryId
      ).toBe(fun.id);
      expect(await tx.query.monthlyBudgets.findMany({ where: eq(monthlyBudgets.categoryId, groceries.id) })).toEqual([]);

      const janAfter = await caller.budget.monthBudget({ budgetId, month: "2025-01-01" });
      const febAfter = await caller.budget.monthBudget({ budgetId, month: "2025-02-01" });
      expect(janAfter.summary).toEqual(jan.summary);
      expect(febAfter.summary).toEqual(feb.summary);
      // Budgeted amounts add to the target's own, so its balance is the sum of both.
      expect(categoryOf(janAfter, fun.id)?.budgeted).toBe(110);
      expect(categoryOf(febAfter, fun.id)?.budgeted).toBe(20);
      expect(categoryOf(febAfter, fun.id)?.available).toBe(
        categoryOf(feb, fun.id)!.available + categoryOf(feb, groceries.id)!.available
      );
    });
  });

  test("refuses a reassignment target that is itself, hidden, a system category or another budget's", async () => {
    await withCaller(async ({ tx, seed, caller, other }) => {
      const { groceries, fun } = seed.categories;
      const { budgetId } = seed;
      await caller.budget.setBudgeted({ budgetId, categoryId: groceries.id, month: "2025-01-01", budgeted: 80 });
      const remove = (reassignToId: number) =>
        caller.category.remove({ budgetId, categoryId: groceries.id, reassignToId });

      await expectTrpcError(remove(groceries.id), "BAD_REQUEST");
      await expectTrpcError(remove(seed.categories.hiddenSystem.id), "CONFLICT");
      await expectTrpcError(remove(other.categories.fun.id), "NOT_FOUND");
      await tx.update(categories).set({ deletedAt: new Date() }).where(eq(categories.id, fun.id));
      await expectTrpcError(remove(fun.id), "BAD_REQUEST");

      expect(await tx.query.categories.findFirst({ where: eq(categories.id, groceries.id) })).toBeDefined();
      const rows = await tx.query.monthlyBudgets.findMany({ where: eq(monthlyBudgets.categoryId, groceries.id) });
      expect(rows.map((r) => r.budgeted)).toEqual(["80.00"]);
    });
  });

  test("an overspent source changes To Be Budgeted, so the delete needs the user's consent", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const { groceries, fun } = seed.categories;
      const { budgetId } = seed;
      await addIncome(tx, seed, 500, "2025-01-02");
      await caller.budget.setBudgeted({ budgetId, categoryId: fun.id, month: "2025-01-01", budgeted: 100 });
      await caller.transaction.create({
        budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: groceries.id,
        amount: -50,
        date: "2025-01-05",
      });
      await tx.update(categoryGroups).set({ inMasterBudgets: true }).where(eq(categoryGroups.id, seed.groups.bills.id));
      const tbb = async (month: string) =>
        (await caller.budget.monthBudget({ budgetId, month })).summary.availableToBudget;
      expect(await tbb("2025-02-01")).toBe(350);

      const preview = await caller.category.reassignPreview({ budgetId, categoryId: groceries.id, reassignToId: fun.id });
      expect(preview.changes[0]).toEqual({ month: "2025-02", delta: 50 });
      expect(preview.changes.every((c) => c.delta === 50)).toBe(true);
      expect(preview.changes.at(-1)?.month).toBe(preview.throughMonth);
      expect(preview.crossesMasterBudgets).toBe(false);
      expect(
        (await caller.category.reassignPreview({ budgetId, categoryId: groceries.id, reassignToId: seed.categories.rent.id }))
          .crossesMasterBudgets
      ).toBe(true);
      // The preview rolled back.
      expect(await tbb("2025-02-01")).toBe(350);

      await expectTrpcError(
        caller.category.remove({ budgetId, categoryId: groceries.id, reassignToId: fun.id }),
        "CONFLICT"
      );
      expect(await tx.query.categories.findFirst({ where: eq(categories.id, groceries.id) })).toBeDefined();
      expect(await tbb("2025-02-01")).toBe(350);

      await caller.category.remove({ budgetId, categoryId: groceries.id, reassignToId: fun.id, acceptTbbChange: true });
      expect(await tx.query.categories.findFirst({ where: eq(categories.id, groceries.id) })).toBeUndefined();
      expect(await tbb("2025-02-01")).toBe(400);
    });
  });
});

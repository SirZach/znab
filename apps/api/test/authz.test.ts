import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { categoryGroups, monthlyBudgets, payees, transactions } from "@znab/db";
import { expectTrpcError, withCaller } from "./harness";

describe("another user's budget is NOT_FOUND", () => {
  test("budget.monthBudget and account.transactions", async () => {
    await withCaller(async ({ seed, otherCaller }) => {
      await expectTrpcError(otherCaller.budget.monthBudget({ budgetId: seed.budgetId, month: "2025-01-01" }), "NOT_FOUND");
      await expectTrpcError(otherCaller.account.transactions({ budgetId: seed.budgetId }), "NOT_FOUND");
      await expectTrpcError(
        otherCaller.account.transactions({ budgetId: seed.budgetId, accountId: seed.accounts.checking.id }),
        "NOT_FOUND"
      );
    });
  });

  test("budgetProcedure refuses it across routers, reads and writes alike, and writes nothing", async () => {
    await withCaller(async ({ tx, seed, otherCaller }) => {
      const budgetId = seed.budgetId;
      // Thunks, so each call starts only once the one before it has been refused.
      const refused: (() => Promise<unknown>)[] = [
        () => otherCaller.budget.byId({ budgetId }),
        () => otherCaller.budget.months({ budgetId }),
        () => otherCaller.budget.setBudgeted({
          budgetId,
          categoryId: seed.categories.rent.id,
          month: "2025-01-01",
          budgeted: 100,
        }),
        () => otherCaller.report.netWorth({ budgetId }),
        () => otherCaller.report.spendingByPayee({ budgetId }),
        () => otherCaller.category.list({ budgetId }),
        () => otherCaller.category.reorderGroups({
          budgetId,
          groupIds: [seed.groups.everyday.id, seed.groups.bills.id],
        }),
        () => otherCaller.account.list({ budgetId }),
        () => otherCaller.account.reconcile({
          budgetId,
          accountId: seed.accounts.checking.id,
          statementBalance: 0,
          statementDate: "2025-01-31",
        }),
        () => otherCaller.payee.list({ budgetId }),
        () => otherCaller.payee.rename({ budgetId, id: seed.payees.grocer.id, name: "Taken" }),
        () => otherCaller.scheduledTransaction.list({ budgetId }),
        () => otherCaller.scheduledTransaction.enterDue({ budgetId }),
        () => otherCaller.householdSplit.setGroupFlag({
          budgetId,
          groupId: seed.groups.bills.id,
          inMasterBudgets: true,
        }),
      ];
      for (const call of refused) await expectTrpcError(call(), "NOT_FOUND");

      const grocer = await tx.query.payees.findFirst({ where: eq(payees.id, seed.payees.grocer.id) });
      expect(grocer!.name).toBe("Corner Grocer");
      const bills = await tx.query.categoryGroups.findFirst({
        where: eq(categoryGroups.id, seed.groups.bills.id),
      });
      expect(bills).toMatchObject({ sortOrder: 0, inMasterBudgets: false });
      expect(await tx.query.monthlyBudgets.findMany({ where: eq(monthlyBudgets.budgetId, budgetId) })).toEqual(
        []
      );
    });
  });

  test("transaction.update with another budget's payeeId or categoryId", async () => {
    await withCaller(async ({ tx, seed, caller, other, otherCaller }) => {
      const row = await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: seed.categories.groceries.id,
        amount: -10,
        date: "2025-03-01",
      });

      await expectTrpcError(caller.transaction.update({ id: row!.id, payeeId: other.payees.grocer.id }), "NOT_FOUND");
      await expectTrpcError(
        caller.transaction.update({ id: row!.id, categoryId: other.categories.groceries.id }),
        "NOT_FOUND"
      );
      await expectTrpcError(otherCaller.transaction.update({ id: row!.id, amount: -1 }), "NOT_FOUND");
      await expectTrpcError(otherCaller.transaction.delete({ id: row!.id }), "NOT_FOUND");

      const stored = await tx.query.transactions.findFirst({ where: eq(transactions.id, row!.id) });
      expect(stored).toMatchObject({
        payeeId: seed.payees.grocer.id,
        categoryId: seed.categories.groceries.id,
        amount: "-10.00",
        deletedAt: null,
      });
    });
  });

  test("transaction.create into another budget, or with its ids", async () => {
    await withCaller(async ({ seed, caller, other }) => {
      await expectTrpcError(
        caller.transaction.create({
          budgetId: other.budgetId,
          accountId: other.accounts.checking.id,
          payeeId: null,
          categoryId: null,
          amount: -1,
          date: "2025-03-01",
        }),
        "NOT_FOUND"
      );
      await expectTrpcError(
        caller.transaction.create({
          budgetId: seed.budgetId,
          accountId: seed.accounts.checking.id,
          payeeId: other.payees.grocer.id,
          categoryId: null,
          amount: -1,
          date: "2025-03-01",
        }),
        "NOT_FOUND"
      );
    });
  });
});

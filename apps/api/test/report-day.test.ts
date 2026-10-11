import { describe, expect, test } from "bun:test";
import { addIncome, expectTrpcError, withCaller } from "./harness";

/**
 * 10 Mar 2025: groceries -40 then a +10 refund on checking, fun -25 on the
 * card, a -75 transfer to savings and +500 income, none of which last two is
 * spending. Groceries -60 on 11 Mar is another day.
 */
describe("dayTransactions", () => {
  test("lists what made up a day's spending, summing to the calendar's figure", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const { budgetId } = seed;
      const { groceries, fun } = seed.categories;
      const checking = seed.accounts.checking.id;
      const credit = seed.accounts.credit.id;
      const enter = (accountId: number, payeeId: number, categoryId: number | null, amount: number, date: string) =>
        caller.transaction.create({ budgetId, accountId, payeeId, categoryId, amount, date, memo: `m${amount}` });
      const grocer = seed.payees.grocer.id;

      await enter(checking, grocer, groceries.id, -40, "2025-03-10");
      await enter(checking, grocer, groceries.id, 10, "2025-03-10");
      await enter(credit, grocer, fun.id, -25, "2025-03-10");
      await enter(checking, seed.transferPayee.savings, null, -75, "2025-03-10");
      await addIncome(tx, seed, 500, "2025-03-10");
      await enter(checking, grocer, groceries.id, -60, "2025-03-11");

      const day = await caller.report.dayTransactions({ budgetId, date: "2025-03-10" });
      expect(day.transactions.map((t) => [t.category, t.accountName, t.payeeName, t.memo, t.spent])).toEqual([
        ["Groceries", "Checking", "Corner Grocer", "m-40", 40],
        ["Fun", "Visa", "Corner Grocer", "m-25", 25],
        ["Groceries", "Checking", "Corner Grocer", "m10", -10],
      ]);
      expect(day.total).toBe(55);
      const calendar = await caller.report.dailySpending({ budgetId, year: 2025 });
      expect(calendar.days.find((d) => d.date === "2025-03-10")?.spent).toBe(day.total);

      const onCard = await caller.report.dayTransactions({ budgetId, date: "2025-03-10", accountIds: [credit] });
      expect(onCard.transactions.map((t) => t.category)).toEqual(["Fun"]);
      const groceriesOnly = await caller.report.dayTransactions({
        budgetId,
        date: "2025-03-10",
        categoryIds: [groceries.id],
      });
      expect(groceriesOnly.total).toBe(30);
    });
  });

  test("refuses a malformed date, another user's budget and ids from another budget", async () => {
    await withCaller(async ({ seed, caller, other, otherCaller }) => {
      const budgetId = seed.budgetId;
      await expectTrpcError(caller.report.dayTransactions({ budgetId, date: "2025-3-10" }), "BAD_REQUEST");
      await expectTrpcError(otherCaller.report.dayTransactions({ budgetId, date: "2025-03-10" }), "NOT_FOUND");
      await expectTrpcError(
        caller.report.dayTransactions({ budgetId, date: "2025-03-10", accountIds: [other.accounts.credit.id] }),
        "NOT_FOUND"
      );
    });
  });
});

import { describe, expect, spyOn, test } from "bun:test";
import { and, eq, isNull, sql } from "drizzle-orm";
import { accounts, payees } from "@znab/db";
import { expectTrpcError, liveTransactions, localDay, withCaller, type Tx } from "./harness";

/** Live payees standing in for an account. */
function backPayees(tx: Tx, accountId: number) {
  return tx.query.payees.findMany({
    where: and(eq(payees.targetAccountId, accountId), isNull(payees.deletedAt)),
  });
}

describe("writeTransferPair through both call sites", () => {
  test("a hand-entered and a scheduled transfer write the same pair and share one back payee", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      // Neither path may assume the back payee exists.
      await tx.delete(payees).where(eq(payees.id, seed.transferPayee.checking));

      const manual = await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.transferPayee.tracking,
        categoryId: seed.categories.rent.id,
        amount: -200,
        date: "2025-03-05",
        cleared: "Cleared",
        memo: "by hand",
        flagColor: "Red",
      });

      const schedule = await caller.scheduledTransaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.transferPayee.tracking,
        categoryId: seed.categories.rent.id,
        amount: -75.5,
        date: localDay(-1),
        frequency: "Monthly",
        memo: "on schedule",
      });
      const { transaction: scheduled } = await caller.scheduledTransaction.enter({ id: schedule.id });

      const back = await backPayees(tx, seed.accounts.checking.id);
      expect(back).toHaveLength(1);

      const farSides = await liveTransactions(tx, seed.accounts.tracking.id);
      expect(farSides).toHaveLength(2);

      for (const near of [manual!, scheduled]) {
        const far = farSides.find((t) => t.ynabId === near.transferTransactionId)!;
        expect(far.transferTransactionId).toBe(near.ynabId);
        expect(near.isTransfer && far.isTransfer).toBe(true);
        expect(near.transferAccountId).toBe(seed.accounts.tracking.id);
        expect(far.transferAccountId).toBe(seed.accounts.checking.id);
        expect(Number(far.amount)).toBe(-Number(near.amount));
        // On-budget to tracking: the category stays on the on-budget side.
        expect(near.categoryId).toBe(seed.categories.rent.id);
        expect(far.categoryId).toBeNull();
        expect(near.payeeId).toBe(seed.transferPayee.tracking);
        expect(far.payeeId).toBe(back[0]!.id);
        expect(far.memo).toBe(near.memo);
        expect(far.date).toBe(near.date);
        // The far side has not seen the money yet, however the near side was entered.
        expect(far.cleared).toBe("Uncleared");
        expect(far.accepted).toBe(true);
        expect(far.flagColor).toBeNull();
        expect(far.dateFromSchedule).toBe(near.dateFromSchedule);
      }

      // What only the near side carries, and only from its own path.
      expect(manual).toMatchObject({ cleared: "Cleared", flagColor: "Red", dateFromSchedule: null });
      expect(scheduled).toMatchObject({
        amount: "-75.50",
        cleared: "Uncleared",
        flagColor: null,
        dateFromSchedule: localDay(-1),
      });
    });
  });

  test("both refuse a transfer to an account that has been deleted, the same way", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const schedule = await caller.scheduledTransaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.transferPayee.savings,
        categoryId: null,
        amount: -10,
        date: localDay(-1),
        frequency: "Monthly",
      });
      await tx.update(accounts).set({ deletedAt: new Date() }).where(eq(accounts.id, seed.accounts.savings.id));

      await expectTrpcError(
        caller.transaction.create({
          budgetId: seed.budgetId,
          accountId: seed.accounts.checking.id,
          payeeId: seed.transferPayee.savings,
          categoryId: null,
          amount: -10,
          date: "2025-03-05",
        }),
        "BAD_REQUEST"
      );
      const result = await caller.scheduledTransaction.enterDue({ budgetId: seed.budgetId });
      expect(result.skipped).toEqual([
        { id: schedule.id, reason: '"Transfer : Savings" points at an account that is no longer in this budget.' },
      ]);
      expect(await liveTransactions(tx, seed.accounts.checking.id)).toHaveLength(0);
    });
  });
});

describe("scheduledTransaction.enterDue catch-up", () => {
  test("a transfer due several times writes every pair and makes the back payee once", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await tx.delete(payees).where(eq(payees.id, seed.transferPayee.checking));
      await caller.scheduledTransaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.transferPayee.savings,
        categoryId: null,
        amount: -25,
        date: localDay(-14),
        frequency: "Weekly",
      });

      const result = await caller.scheduledTransaction.enterDue({ budgetId: seed.budgetId });
      expect(result.entered).toBe(3);

      const near = await liveTransactions(tx, seed.accounts.checking.id);
      const far = await liveTransactions(tx, seed.accounts.savings.id);
      expect(near.map((t) => t.date).sort()).toEqual([localDay(-14), localDay(-7), localDay(0)]);
      expect(far.map((t) => t.amount)).toEqual(["25.00", "25.00", "25.00"]);
      expect(new Set(far.map((t) => t.payeeId)).size).toBe(1);
      expect(await backPayees(tx, seed.accounts.checking.id)).toHaveLength(1);
    });
  });

  test("an unexpected failure is logged, reported as skipped, and the rest still go in", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      // A trigger stands in for a bug: an error that is not a refusal. It is
      // created inside the test's transaction, so it rolls back with it.
      await tx.execute(sql`
        CREATE FUNCTION pg_temp.boom() RETURNS trigger AS $$
        BEGIN
          IF NEW.memo = 'boom' THEN RAISE EXCEPTION 'boom'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql
      `);
      await tx.execute(sql`
        CREATE TRIGGER boom BEFORE INSERT ON transactions
        FOR EACH ROW EXECUTE FUNCTION pg_temp.boom()
      `);

      const base = {
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: seed.categories.groceries.id,
        date: localDay(-1),
        frequency: "Once" as const,
      };
      const bad = await caller.scheduledTransaction.create({ ...base, amount: -1, memo: "boom" });
      await caller.scheduledTransaction.create({ ...base, amount: -2, memo: "fine" });

      const logged = spyOn(console, "error").mockImplementation(() => {});
      try {
        const result = await caller.scheduledTransaction.enterDue({ budgetId: seed.budgetId });
        expect(result.entered).toBe(1);
        expect(result.skipped).toEqual([{ id: bad.id, reason: "This one could not be entered." }]);
        expect(logged).toHaveBeenCalledTimes(1);
        expect(String(logged.mock.calls[0]![0])).toContain(`schedule ${bad.id}`);
      } finally {
        logged.mockRestore();
      }
      const rows = await liveTransactions(tx, seed.accounts.checking.id);
      expect(rows.map((t) => t.memo)).toEqual(["fine"]);
    });
  });
});

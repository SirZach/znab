import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { scheduledTransactions } from "@znab/db";
import { liveTransactions, localDay, withCaller, type Caller, type Seed } from "./harness";

// enterDue reads the server's local "today" itself, so every date here is
// relative to it. That keeps each schedule due (or not) whatever day this runs.
function schedule(
  caller: Caller,
  seed: Seed,
  opts: { date: string; frequency: "Once" | "Weekly" | "Monthly"; payeeId: number; categoryId: number | null; amount: number }
) {
  return caller.scheduledTransaction.create({
    budgetId: seed.budgetId,
    accountId: seed.accounts.checking.id,
    ...opts,
  });
}

describe("scheduledTransaction.enterDue", () => {
  test("enters every due occurrence once, advances, retires one-offs and pairs transfers", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const { grocer } = seed.payees;
      const weekly = await schedule(caller, seed, {
        date: localDay(-14),
        frequency: "Weekly",
        payeeId: grocer.id,
        categoryId: seed.categories.groceries.id,
        amount: -20,
      });
      const once = await schedule(caller, seed, {
        date: localDay(-3),
        frequency: "Once",
        payeeId: grocer.id,
        categoryId: seed.categories.fun.id,
        amount: -5,
      });
      const toSavings = await schedule(caller, seed, {
        date: localDay(-1),
        frequency: "Monthly",
        payeeId: seed.transferPayee.savings,
        categoryId: null,
        amount: -300,
      });
      // The date boundary: tomorrow is not due yet.
      const tomorrow = await schedule(caller, seed, {
        date: localDay(1),
        frequency: "Once",
        payeeId: grocer.id,
        categoryId: null,
        amount: -1,
      });

      const result = await caller.scheduledTransaction.enterDue({ budgetId: seed.budgetId });
      expect(result.asOf).toBe(localDay(0));
      // Weekly: -14, -7 and today (the boundary is inclusive). Once: 1. Transfer: 1.
      expect(result.entered).toBe(5);
      expect(result.schedules).toBe(3);
      expect(result.skipped).toEqual([]);
      expect(result.cappedOut).toBe(false);

      const checking = await liveTransactions(tx, seed.accounts.checking.id);
      const weeklyDates = checking.filter((t) => t.amount === "-20.00").map((t) => t.date);
      expect(weeklyDates.sort()).toEqual([localDay(-14), localDay(-7), localDay(0)]);
      for (const t of checking) expect(t.dateFromSchedule).toBe(t.date);
      expect(checking.some((t) => t.amount === "-1.00")).toBe(false);

      const [savingsSide] = await liveTransactions(tx, seed.accounts.savings.id);
      const checkingSide = checking.find((t) => t.amount === "-300.00")!;
      expect(savingsSide!.amount).toBe("300.00");
      expect(checkingSide.isTransfer).toBe(true);
      expect(checkingSide.transferTransactionId).toBe(savingsSide!.ynabId);
      expect(savingsSide!.transferTransactionId).toBe(checkingSide.ynabId);

      const byId = async (id: number) =>
        (await tx.query.scheduledTransactions.findFirst({ where: eq(scheduledTransactions.id, id) }))!;
      expect((await byId(weekly.id)).date).toBe(localDay(7));
      expect((await byId(weekly.id)).deletedAt).toBeNull();
      expect((await byId(once.id)).deletedAt).not.toBeNull();
      expect((await byId(toSavings.id)).date > localDay(0)).toBe(true);
      expect((await byId(tomorrow.id)).date).toBe(localDay(1));
      expect((await byId(tomorrow.id)).deletedAt).toBeNull();

      // Running it again enters nothing: each occurrence goes in exactly once.
      const again = await caller.scheduledTransaction.enterDue({ budgetId: seed.budgetId });
      expect(again.entered).toBe(0);
      expect(await liveTransactions(tx, seed.accounts.checking.id)).toHaveLength(checking.length);
    });
  });
});

import { describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { payeeRenameRules, payees, scheduledTransactions, transactions } from "@znab/db";
import { expectTrpcError, withCaller } from "./harness";

describe("payee.merge", () => {
  test("repoints transactions, schedules and rename rules to the survivor", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const make = async (name: string) =>
        (
          await tx
            .insert(payees)
            .values({ ynabId: `Payee/${crypto.randomUUID()}`, budgetId: seed.budgetId, name })
            .returning()
        )[0]!;
      const a = await make("ACME INC");
      const b = await make("Acme Inc.");
      const target = seed.payees.grocer;

      const enter = (payeeId: number) =>
        caller.transaction.create({
          budgetId: seed.budgetId,
          accountId: seed.accounts.checking.id,
          payeeId,
          categoryId: seed.categories.fun.id,
          amount: -10,
          date: "2025-03-01",
        });
      const t1 = await enter(a.id);
      const t2 = await enter(b.id);
      const sched = await caller.scheduledTransaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: b.id,
        categoryId: null,
        amount: -10,
        date: "2025-04-01",
        frequency: "Monthly",
      });
      await caller.payee.addRenameRule({ budgetId: seed.budgetId, payeeId: a.id, operator: "Is", operand: "ACME*123" });

      const result = await caller.payee.merge({ budgetId: seed.budgetId, sourceIds: [a.id, b.id], targetId: target.id });
      expect(result).toEqual({ movedTransactions: 2, movedRenameRules: 1 });

      const txns = await tx.query.transactions.findMany({ where: inArray(transactions.id, [t1!.id, t2!.id]) });
      expect(txns.map((t) => t.payeeId)).toEqual([target.id, target.id]);
      const s = await tx.query.scheduledTransactions.findFirst({ where: eq(scheduledTransactions.id, sched.id) });
      expect(s!.payeeId).toBe(target.id);
      const rules = await tx.query.payeeRenameRules.findMany({ where: eq(payeeRenameRules.budgetId, seed.budgetId) });
      expect(rules.map((r) => r.payeeId)).toEqual([target.id]);
      const sources = await tx.query.payees.findMany({ where: inArray(payees.id, [a.id, b.id]) });
      for (const p of sources) expect(p.deletedAt).not.toBeNull();
    });
  });

  test("refuses a transfer payee on either side", async () => {
    await withCaller(async ({ seed, caller }) => {
      await expectTrpcError(
        caller.payee.merge({ budgetId: seed.budgetId, sourceIds: [seed.transferPayee.savings], targetId: seed.payees.grocer.id }),
        "BAD_REQUEST"
      );
      await expectTrpcError(
        caller.payee.merge({ budgetId: seed.budgetId, sourceIds: [seed.payees.grocer.id], targetId: seed.transferPayee.savings }),
        "BAD_REQUEST"
      );
    });
  });
});

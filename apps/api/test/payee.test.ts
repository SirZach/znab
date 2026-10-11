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

describe("payee writes run in one transaction against a locked payee", () => {
  test("rename trims, refuses a clash and a transfer payee, and writes nothing on refusal", async () => {
    await withCaller(async ({ tx, seed, caller, other }) => {
      const [extra] = await tx
        .insert(payees)
        .values({ ynabId: `Payee/${crypto.randomUUID()}`, budgetId: seed.budgetId, name: "Hilton " })
        .returning();

      await expectTrpcError(
        caller.payee.rename({ budgetId: seed.budgetId, id: seed.payees.grocer.id, name: " hilton" }),
        "CONFLICT"
      );
      await expectTrpcError(
        caller.payee.rename({ budgetId: seed.budgetId, id: seed.transferPayee.savings, name: "Nope" }),
        "BAD_REQUEST"
      );
      await expectTrpcError(
        caller.payee.rename({ budgetId: seed.budgetId, id: other.payees.grocer.id, name: "Mine" }),
        "NOT_FOUND"
      );
      const grocer = await tx.query.payees.findFirst({ where: eq(payees.id, seed.payees.grocer.id) });
      expect(grocer!.name).toBe("Corner Grocer");

      expect(
        await caller.payee.rename({ budgetId: seed.budgetId, id: extra!.id, name: "  Hilton Hotels  " })
      ).toEqual({ id: extra!.id, name: "Hilton Hotels" });
    });
  });

  test("delete refuses a used payee and takes an unused one with its rename rules", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: null,
        amount: -1,
        date: "2025-03-01",
      });
      await expectTrpcError(caller.payee.delete({ budgetId: seed.budgetId, id: seed.payees.grocer.id }), "CONFLICT");

      const [unused] = await tx
        .insert(payees)
        .values({ ynabId: `Payee/${crypto.randomUUID()}`, budgetId: seed.budgetId, name: "Unused" })
        .returning();
      const rule = await caller.payee.addRenameRule({
        budgetId: seed.budgetId,
        payeeId: unused!.id,
        operator: "Contains",
        operand: " UNUSED ",
      });
      expect(rule.operand).toBe("UNUSED");
      await expectTrpcError(
        caller.payee.addRenameRule({
          budgetId: seed.budgetId,
          payeeId: seed.payees.grocer.id,
          operator: "Contains",
          operand: "unused",
        }),
        "CONFLICT"
      );

      expect(await caller.payee.delete({ budgetId: seed.budgetId, id: unused!.id })).toEqual({ id: unused!.id });
      const gone = await tx.query.payees.findFirst({ where: eq(payees.id, unused!.id) });
      expect(gone!.deletedAt).not.toBeNull();
      const rules = await tx.query.payeeRenameRules.findMany({ where: eq(payeeRenameRules.id, rule.id) });
      expect(rules[0]!.deletedAt).not.toBeNull();
    });
  });

  test("setAutofill refuses another budget's category and saves its own", async () => {
    await withCaller(async ({ seed, caller, other }) => {
      const base = { budgetId: seed.budgetId, id: seed.payees.grocer.id, amount: -12.5, memo: "  weekly  " };
      await expectTrpcError(
        caller.payee.setAutofill({ ...base, categoryId: other.categories.groceries.id }),
        "NOT_FOUND"
      );
      expect(await caller.payee.setAutofill({ ...base, categoryId: seed.categories.groceries.id })).toEqual({
        id: seed.payees.grocer.id,
        autofillCategoryId: seed.categories.groceries.id,
        autofillAmount: "-12.50",
        autofillMemo: "weekly",
      });
    });
  });
});

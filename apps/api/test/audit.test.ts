import { describe, expect, test } from "bun:test";
import { and, asc, eq } from "drizzle-orm";
import { auditLog, transactions } from "@znab/db";
import { audit } from "../src/lib/audit";
import { expectTrpcError, localDay, withCaller, type Tx } from "./harness";

/** Every audit row for a budget, oldest first. */
function auditRows(tx: Tx, budgetId: number, entity?: string) {
  return tx
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.budgetId, budgetId), entity ? eq(auditLog.entity, entity) : undefined))
    .orderBy(asc(auditLog.id));
}

type Logged = { amount?: string; cleared?: string; budgeted?: string; deletedAt?: string | null };

describe("audit log", () => {
  test("a plain transaction is logged on create, update and delete", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const txn = await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        categoryId: seed.categories.rent.id,
        payeeId: null,
        amount: -50,
        date: "2025-03-01",
      });
      await caller.transaction.update({ id: txn!.id, amount: -60 });
      await caller.transaction.delete({ id: txn!.id });

      const rows = await auditRows(tx, seed.budgetId);
      expect(rows.map((r) => [r.entity, r.entityId, r.action, r.userId])).toEqual([
        ["transaction", txn!.id, "create", seed.user.id],
        ["transaction", txn!.id, "update", seed.user.id],
        ["transaction", txn!.id, "delete", seed.user.id],
      ]);
      const [created, updated, deleted] = rows.map((r) => ({
        before: r.before as Logged | null,
        after: r.after as Logged | null,
      }));
      expect(created!.before).toBeNull();
      expect(created!.after!.amount).toBe("-50.00");
      expect(updated!.before!.amount).toBe("-50.00");
      expect(updated!.after!.amount).toBe("-60.00");
      expect(deleted!.before!.deletedAt).toBeNull();
      expect(deleted!.after!.deletedAt).not.toBeNull();
    });
  });

  test("both sides of a transfer are logged, and both again when it changes", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const near = await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.transferPayee.savings,
        categoryId: null,
        amount: -100,
        date: "2025-03-02",
      });
      const [far] = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.ynabId, near!.transferTransactionId!));

      await caller.transaction.update({ id: near!.id, amount: -120 });
      await caller.transaction.delete({ id: near!.id });

      const rows = await auditRows(tx, seed.budgetId);
      const byAction = (action: string) =>
        rows.filter((r) => r.action === action).map((r) => r.entityId).sort();
      const pair = [near!.id, far!.id].sort();
      expect(byAction("create")).toEqual(pair);
      expect(byAction("update")).toEqual(pair);
      expect(byAction("delete")).toEqual(pair);

      const farUpdate = rows.find((r) => r.action === "update" && r.entityId === far!.id)!;
      expect((farUpdate.before as Logged).amount).toBe("100.00");
      expect((farUpdate.after as Logged).amount).toBe("120.00");
    });
  });

  test("an audit row rolls back with the write it records", async () => {
    await withCaller(async ({ tx, seed }) => {
      const failed = tx.transaction(async (inner) => {
        const [txn] = await inner
          .insert(transactions)
          .values({
            ynabId: crypto.randomUUID(),
            budgetId: seed.budgetId,
            accountId: seed.accounts.checking.id,
            amount: "-5",
            date: "2025-03-03",
          })
          .returning();
        await audit(inner, seed.user.id, "transaction", { after: [txn!] });
        throw new Error("refused after writing");
      });
      await expect(failed).rejects.toThrow("refused after writing");

      expect(await auditRows(tx, seed.budgetId)).toEqual([]);
    });
  });

  test("a refused edit writes nothing to the log", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const txn = await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: null,
        categoryId: null,
        amount: -5,
        date: "2025-03-03",
        cleared: "Cleared",
      });
      await caller.account.reconcile({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        statementBalance: -5,
        statementDate: "2025-03-31",
      });
      const before = (await auditRows(tx, seed.budgetId)).length;

      await expectTrpcError(caller.transaction.update({ id: txn!.id, amount: -6 }), "BAD_REQUEST");
      expect(await auditRows(tx, seed.budgetId)).toHaveLength(before);
    });
  });

  test("allocations are logged as created, then updated", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const key = { budgetId: seed.budgetId, categoryId: seed.categories.rent.id, month: "2025-03-01" };
      await caller.budget.setBudgeted({ ...key, budgeted: 500 });
      await caller.budget.setBudgeted({ ...key, budgeted: 550 });

      const rows = await auditRows(tx, seed.budgetId, "monthly_budget");
      expect(rows.map((r) => r.action)).toEqual(["create", "update"]);
      expect((rows[1]!.before as Logged).budgeted).toBe("500.00");
      expect((rows[1]!.after as Logged).budgeted).toBe("550.00");
    });
  });

  test("reconciling logs each swept row and the account", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const txn = await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: null,
        categoryId: null,
        amount: 40,
        date: "2025-03-04",
        cleared: "Cleared",
      });
      await caller.account.reconcile({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        statementBalance: 40,
        statementDate: "2025-03-31",
      });

      const swept = (await auditRows(tx, seed.budgetId, "transaction")).find(
        (r) => r.action === "update" && r.entityId === txn!.id
      )!;
      expect((swept.before as Logged).cleared).toBe("Cleared");
      expect((swept.after as Logged).cleared).toBe("Reconciled");

      const account = await auditRows(tx, seed.budgetId, "account");
      expect(account.map((r) => [r.entityId, r.action])).toEqual([
        [seed.accounts.checking.id, "update"],
      ]);
    });
  });

  test("reconciling with nothing to sweep logs only the account", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: null,
        categoryId: null,
        amount: 15,
        date: "2025-03-04",
      });
      const before = (await auditRows(tx, seed.budgetId, "transaction")).length;

      const result = await caller.account.reconcile({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        statementBalance: 0,
        statementDate: "2025-03-31",
      });
      expect(result.reconciledCount).toBe(0);
      expect(await auditRows(tx, seed.budgetId, "transaction")).toHaveLength(before);
      expect((await auditRows(tx, seed.budgetId, "account")).map((r) => r.action)).toEqual([
        "update",
      ]);
    });
  });

  test("entering a schedule logs the transaction and the schedule moving on", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const schedule = await caller.scheduledTransaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        categoryId: seed.categories.rent.id,
        payeeId: null,
        amount: -900,
        date: localDay(-1),
        frequency: "Monthly",
      });
      const { transaction } = await caller.scheduledTransaction.enter({ id: schedule.id });

      const rows = await auditRows(tx, seed.budgetId);
      expect(rows.map((r) => [r.entity, r.entityId, r.action])).toEqual([
        ["scheduled_transaction", schedule.id, "create"],
        ["transaction", transaction.id, "create"],
        ["scheduled_transaction", schedule.id, "update"],
      ]);
    });
  });

  test("deleting a category logs the row it took away", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const id = seed.categories.electric.id;
      await caller.category.remove({ budgetId: seed.budgetId, categoryId: id });

      const [row] = await auditRows(tx, seed.budgetId, "category");
      expect(row).toMatchObject({ entityId: id, action: "delete", after: null });
      expect((row!.before as { name: string }).name).toBe(seed.categories.electric.name);
    });
  });

  test("audit.list reads newest first, filters to one row, pages, and stays in its budget", async () => {
    await withCaller(async ({ seed, caller, otherCaller }) => {
      const make = (amount: number) =>
        caller.transaction.create({
          budgetId: seed.budgetId,
          accountId: seed.accounts.checking.id,
          payeeId: null,
          categoryId: null,
          amount,
          date: "2025-03-05",
        });
      const a = await make(-1);
      const b = await make(-2);
      await caller.transaction.update({ id: a!.id, amount: -3 });

      const all = await caller.audit.list({ budgetId: seed.budgetId });
      expect(all.entries.map((e) => [e.entityId, e.action])).toEqual([
        [a!.id, "update"],
        [b!.id, "create"],
        [a!.id, "create"],
      ]);
      expect(all.hasMore).toBe(false);

      const history = await caller.audit.list({
        budgetId: seed.budgetId,
        entity: "transaction",
        entityId: a!.id,
      });
      expect(history.entries.map((e) => e.action)).toEqual(["update", "create"]);

      const page = await caller.audit.list({ budgetId: seed.budgetId, limit: 2, offset: 1 });
      expect(page.entries.map((e) => e.entityId)).toEqual([b!.id, a!.id]);
      expect(page.hasMore).toBe(false);
      expect((await caller.audit.list({ budgetId: seed.budgetId, limit: 2 })).hasMore).toBe(true);

      await expectTrpcError(otherCaller.audit.list({ budgetId: seed.budgetId }), "NOT_FOUND");
    });
  });
});

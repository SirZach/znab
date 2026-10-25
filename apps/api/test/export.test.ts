import { describe, expect, test } from "bun:test";
import { type db, subTransactions, transactions } from "@znab/db";
import { exportTransactionsCsv } from "../src/lib/transactions-csv";
import { withCaller, type Tx } from "./harness";

function download(tx: Tx, budgetId: number | string, slug?: string) {
  const req = new Request(`http://test/export/${budgetId}/transactions.csv`, {
    headers: slug ? { "x-user-slug": slug } : {},
  });
  return exportTransactionsCsv(tx as unknown as typeof db, req, String(budgetId));
}

describe("GET /export/:budgetId/transactions.csv", () => {
  test("writes every live transaction, with a split spread over its parts", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: seed.categories.groceries.id,
        amount: -42.1,
        date: "2025-03-01",
        memo: 'eggs, "free range"',
      });
      const gone = await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: null,
        categoryId: null,
        amount: -1,
        date: "2025-03-02",
      });
      await caller.transaction.delete({ id: gone!.id });

      const [split] = await tx
        .insert(transactions)
        .values({
          ynabId: crypto.randomUUID(),
          budgetId: seed.budgetId,
          accountId: seed.accounts.credit.id,
          amount: "-30",
          date: "2025-03-03",
          isSplit: true,
          flagColor: "Blue",
        })
        .returning();
      await tx.insert(subTransactions).values([
        { ynabId: "s1", transactionId: split!.id, categoryId: seed.categories.rent.id, amount: "-20", memo: "half" },
        { ynabId: "s2", transactionId: split!.id, categoryId: seed.categories.fun.id, amount: "-10" },
      ]);

      const res = await download(tx, seed.budgetId, seed.user.slug);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename=".+-transactions-\d{4}-\d{2}-\d{2}\.csv"$/);

      const lines = (await res.text()).trimEnd().split("\r\n");
      expect(lines).toEqual([
        "Account,Date,Payee,Category Group,Category,Memo,Outflow,Inflow,Cleared,Flag",
        `Checking,2025-03-01,Corner Grocer,Everyday,Groceries,"eggs, ""free range""",$42.10,$0.00,U,`,
        "Visa,2025-03-03,,Monthly Bills,Rent,(Split 1/2) half,$20.00,$0.00,U,Blue",
        "Visa,2025-03-03,,Everyday,Fun,(Split 2/2),$10.00,$0.00,U,Blue",
      ]);
    });
  });

  test("refuses a missing user, someone else's budget and a malformed id", async () => {
    await withCaller(async ({ tx, seed, other }) => {
      expect((await download(tx, seed.budgetId)).status).toBe(401);
      expect((await download(tx, seed.budgetId, "nobody-by-this-name")).status).toBe(401);
      expect((await download(tx, seed.budgetId, other.user.slug)).status).toBe(404);
      expect((await download(tx, "abc", seed.user.slug)).status).toBe(404);
    });
  });
});

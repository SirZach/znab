import { describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { payees, transactions } from "@znab/db";
import {
  countRows,
  expectTrpcError,
  liveTransactions,
  withCaller,
  type Caller,
  type Seed,
} from "./harness";

const DATE = "2025-03-05";

/** Enters `amount` from `from` into the account behind `toPayee`. */
function transfer(caller: Caller, seed: Seed, from: "checking" | "savings" | "tracking" | "credit", to: "checking" | "savings" | "tracking" | "credit", amount: number, categoryId: number | null = null) {
  return caller.transaction.create({
    budgetId: seed.budgetId,
    accountId: seed.accounts[from].id,
    payeeId: seed.transferPayee[to],
    categoryId,
    amount,
    date: DATE,
  });
}

describe("transaction.create transfers", () => {
  test("on-budget to on-budget writes a linked, negated, uncategorized pair and the back payee once", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      // Drop the checking account's own transfer payee so the router has to make it.
      await tx.delete(payees).where(eq(payees.id, seed.transferPayee.checking));

      const near = await transfer(caller, seed, "checking", "savings", -100, seed.categories.groceries.id);
      await transfer(caller, seed, "checking", "savings", -25);

      const [far] = await liveTransactions(tx, seed.accounts.savings.id);
      expect(near!.amount).toBe("-100.00");
      expect(far!.amount).toBe("100.00");
      // Money between two budget accounts is spent nowhere, whatever was sent.
      expect(near!.categoryId).toBeNull();
      expect(far!.categoryId).toBeNull();
      expect(near!.isTransfer).toBe(true);
      expect(far!.isTransfer).toBe(true);
      expect(near!.transferTransactionId).toBe(far!.ynabId);
      expect(far!.transferTransactionId).toBe(near!.ynabId);
      expect(near!.transferAccountId).toBe(seed.accounts.savings.id);
      expect(far!.transferAccountId).toBe(seed.accounts.checking.id);

      const back = await tx.query.payees.findMany({
        where: and(eq(payees.targetAccountId, seed.accounts.checking.id), isNull(payees.deletedAt)),
      });
      expect(back).toHaveLength(1);
      expect(back[0]!.name).toBe("Transfer : Checking");
      expect(far!.payeeId).toBe(back[0]!.id);
    });
  });

  test("on-budget to off-budget keeps the category on the on-budget side only", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const near = await transfer(caller, seed, "checking", "tracking", -200, seed.categories.rent.id);
      const [far] = await liveTransactions(tx, seed.accounts.tracking.id);
      expect(near!.categoryId).toBe(seed.categories.rent.id);
      expect(far!.categoryId).toBeNull();

      // Entered from the tracking side, the category still lands on checking.
      const fromTracking = await transfer(caller, seed, "tracking", "checking", 50, seed.categories.fun.id);
      const checkingRows = await liveTransactions(tx, seed.accounts.checking.id);
      expect(fromTracking!.categoryId).toBeNull();
      expect(checkingRows.at(-1)!.categoryId).toBe(seed.categories.fun.id);
      expect(checkingRows.at(-1)!.amount).toBe("-50.00");
    });
  });
});

describe("transaction.update on a transfer", () => {
  test("amount, date and category mirror to the counterpart", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const near = await transfer(caller, seed, "checking", "tracking", -200, seed.categories.rent.id);

      await caller.transaction.update({ id: near!.id, amount: -150, date: "2025-03-10" });
      let [far] = await liveTransactions(tx, seed.accounts.tracking.id);
      expect(far!.amount).toBe("150.00");
      expect(far!.date).toBe("2025-03-10");

      // A category sent on the off-budget side is filed on the on-budget side.
      await caller.transaction.update({ id: far!.id, categoryId: seed.categories.groceries.id });
      [far] = await liveTransactions(tx, seed.accounts.tracking.id);
      const [nearNow] = await liveTransactions(tx, seed.accounts.checking.id);
      expect(far!.categoryId).toBeNull();
      expect(nearNow!.categoryId).toBe(seed.categories.groceries.id);
      expect(nearNow!.amount).toBe("-150.00");
    });
  });

  test("is refused when the counterpart is reconciled, unless acknowledged", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const near = await transfer(caller, seed, "checking", "savings", -100);
      await tx
        .update(transactions)
        .set({ cleared: "Reconciled" })
        .where(eq(transactions.ynabId, near!.transferTransactionId!));

      await expectTrpcError(caller.transaction.update({ id: near!.id, amount: -90 }), "BAD_REQUEST");
      const [far] = await liveTransactions(tx, seed.accounts.savings.id);
      expect(far!.amount).toBe("100.00");

      await caller.transaction.update({ id: near!.id, amount: -90, acknowledgeReconciled: true });
      const [farAfter] = await liveTransactions(tx, seed.accounts.savings.id);
      expect(farAfter!.amount).toBe("90.00");
    });
  });
});

describe("transaction.delete on a transfer", () => {
  test("soft deletes both sides and restores both balances", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const balances = async () => {
        const list = await caller.account.list({ budgetId: seed.budgetId });
        const of = (id: number) => list.find((a) => a.id === id)!.balance;
        return [of(seed.accounts.checking.id), of(seed.accounts.savings.id)];
      };
      await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: seed.payees.grocer.id,
        categoryId: seed.categories.groceries.id,
        amount: -40,
        date: DATE,
      });
      const before = await balances();

      const near = await transfer(caller, seed, "checking", "savings", -100);
      expect(await balances()).toEqual([before[0]! - 100, before[1]! + 100]);

      await caller.transaction.delete({ id: near!.id });
      expect(await balances()).toEqual(before);

      const pair = await tx.query.transactions.findMany({
        where: eq(transactions.transferTransactionId, near!.ynabId),
      });
      const both = [...pair, ...(await tx.query.transactions.findMany({ where: eq(transactions.id, near!.id) }))];
      expect(both).toHaveLength(2);
      for (const row of both) expect(row.deletedAt).not.toBeNull();
    });
  });
});

describe("transaction.create payees", () => {
  test("a typed name matching an existing payee by case and spacing reuses it", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const before = await countRows(tx, payees, seed.budgetId);
      const row = await caller.transaction.create({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        payeeId: null,
        payeeName: "  corner GROCER  ",
        categoryId: seed.categories.groceries.id,
        amount: -12.5,
        date: DATE,
      });
      expect(row!.payeeId).toBe(seed.payees.grocer.id);
      expect(await countRows(tx, payees, seed.budgetId)).toBe(before);
    });
  });

  test("a failed create leaves no orphan payee behind", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const before = await countRows(tx, payees, seed.budgetId);
      // The schema only checks the date's shape, so Feb 30 gets as far as the
      // row insert and fails there, after the payee has been made. The payee
      // must go with the row. (If date validation is tightened, this needs
      // another way to fail inside the write.)
      await expectTrpcError(
        caller.transaction.create({
          budgetId: seed.budgetId,
          accountId: seed.accounts.checking.id,
          payeeId: null,
          payeeName: "Brand New Payee",
          categoryId: null,
          amount: -12,
          date: "2025-02-30",
        }),
        "INTERNAL_SERVER_ERROR"
      );
      expect(await countRows(tx, payees, seed.budgetId)).toBe(before);
      expect(await countRows(tx, transactions, seed.budgetId)).toBe(0);
    });
  });
});

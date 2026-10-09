import { describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { categories, categoryGroups, payees, transactions } from "@znab/db";
import {
  IMMEDIATE_INCOME,
  expectTrpcError,
  liveTransactions,
  localDay,
  withCaller,
  type Caller,
  type Seed,
} from "./harness";

function enter(caller: Caller, seed: Seed, amount: number, date: string, cleared: "Cleared" | "Uncleared") {
  return caller.transaction.create({
    budgetId: seed.budgetId,
    accountId: seed.accounts.checking.id,
    payeeId: seed.payees.grocer.id,
    categoryId: seed.categories.groceries.id,
    amount,
    date,
    cleared,
  });
}

describe("account.reconcile", () => {
  // Cleared up to the statement date: +100 and -30, so the cleared balance is 70.
  // The uncleared row and the cleared row after the date are not the statement's.
  async function scenario(caller: Caller, seed: Seed) {
    await enter(caller, seed, 100, "2025-03-01", "Cleared");
    await enter(caller, seed, -30, "2025-03-05", "Cleared");
    await enter(caller, seed, -10, "2025-03-02", "Uncleared");
    await enter(caller, seed, 999, "2025-03-20", "Cleared");
  }

  test("a balanced statement flips Cleared rows up to the date to Reconciled", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await scenario(caller, seed);
      const result = await caller.account.reconcile({
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        statementBalance: 70,
        statementDate: "2025-03-10",
      });
      expect(result).toEqual({ reconciledCount: 2, adjustmentAmount: null, clearedBalance: 70, difference: 0 });

      const rows = await liveTransactions(tx, seed.accounts.checking.id);
      const status = Object.fromEntries(rows.map((r) => [r.date, r.cleared]));
      expect(status).toEqual({
        "2025-03-01": "Reconciled",
        "2025-03-05": "Reconciled",
        "2025-03-02": "Uncleared",
        "2025-03-20": "Cleared",
      });
      const account = await tx.query.accounts.findFirst({
        where: (a, { eq }) => eq(a.id, seed.accounts.checking.id),
      });
      expect(account!.lastReconciledDate).toBe("2025-03-10");
      expect(account!.lastReconciledBalance).toBe("70.00");
    });
  });

  test("an unbalanced statement is refused without adjustment and adjusted with it", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await scenario(caller, seed);
      const input = {
        budgetId: seed.budgetId,
        accountId: seed.accounts.checking.id,
        statementBalance: 82.35,
        statementDate: "2025-03-10",
      };
      await expectTrpcError(caller.account.reconcile(input), "BAD_REQUEST");
      expect((await liveTransactions(tx, seed.accounts.checking.id)).map((r) => r.cleared)).not.toContain(
        "Reconciled"
      );

      const result = await caller.account.reconcile({ ...input, adjustment: true });
      expect(result.difference).toBe(12.35);
      expect(result.adjustmentAmount).toBe(12.35);
      expect(result.reconciledCount).toBe(2);

      const adjustments = await tx
        .select({ t: transactions, payeeName: payees.name })
        .from(transactions)
        .innerJoin(payees, eq(payees.id, transactions.payeeId))
        .where(
          and(
            eq(transactions.accountId, seed.accounts.checking.id),
            eq(payees.name, "Reconciliation Balance Adjustment")
          )
        );
      expect(adjustments).toHaveLength(1);
      const row = adjustments[0]!.t;
      expect(row.amount).toBe("12.35");
      expect(row.date).toBe("2025-03-10");
      expect(row.cleared).toBe("Reconciled");
      // On budget, so the difference is income to To be Budgeted.
      expect(row.categoryYnabId).toBe(IMMEDIATE_INCOME);
    });
  });
});

describe("account.create with a starting balance", () => {
  test("an on-budget cash account opens with a Cleared income row", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const account = await caller.account.create({
        budgetId: seed.budgetId,
        name: "New Checking",
        accountType: "Checking",
        onBudget: true,
        startingBalance: 500,
        startingBalanceDate: "2025-02-01",
      });
      const [row] = await liveTransactions(tx, account.id);
      expect(row!.amount).toBe("500.00");
      expect(row!.date).toBe("2025-02-01");
      expect(row!.cleared).toBe("Cleared");
      expect(row!.categoryYnabId).toBe(IMMEDIATE_INCOME);
      expect(row!.categoryId).toBeNull();
      const payee = await tx.query.payees.findFirst({ where: eq(payees.id, row!.payeeId!) });
      expect(payee!.name).toBe("Starting Balance");
      expect(payee!.enabled).toBe(false);

      // It reaches To be Budgeted.
      const month = await caller.budget.monthBudget({ budgetId: seed.budgetId, month: "2025-02-01" });
      expect(month.summary.income).toBe(500);
    });
  });

  test("an on-budget credit card opens owing, filed under Pre-YNAB Debt", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const account = await caller.account.create({
        budgetId: seed.budgetId,
        name: "New Card",
        accountType: "CreditCard",
        onBudget: true,
        startingBalance: -1200,
        startingBalanceDate: "2025-02-01",
      });
      const [row] = await liveTransactions(tx, account.id);
      expect(row!.amount).toBe("-1200.00");
      expect(row!.categoryYnabId).toBe(`Category/PreYNABDebt/${account.ynabId}`);

      const category = await tx.query.categories.findFirst({ where: eq(categories.id, row!.categoryId!) });
      expect(category!.name).toBe("New Card");
      const group = await tx.query.categoryGroups.findFirst({
        where: eq(categoryGroups.id, category!.groupId),
      });
      expect(group!.ynabId).toBe("MasterCategory/__PreYNABDebtMaster__");
      expect(group!.isSystem).toBe(true);
    });
  });

  test("a tracking account's opening balance is not categorized", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      const account = await caller.account.create({
        budgetId: seed.budgetId,
        name: "House",
        accountType: "InvestmentAccount",
        onBudget: false,
        startingBalance: 250000,
        startingBalanceDate: "2025-02-01",
      });
      const [row] = await liveTransactions(tx, account.id);
      expect(row!.categoryYnabId).toBeNull();
      expect(row!.categoryId).toBeNull();
    });
  });

  test("a starting balance dated in the future is refused and writes nothing", async () => {
    await withCaller(async ({ tx, seed, caller }) => {
      await expectTrpcError(
        caller.account.create({
          budgetId: seed.budgetId,
          name: "Tomorrow",
          accountType: "Checking",
          onBudget: true,
          startingBalance: 10,
          startingBalanceDate: localDay(1),
        }),
        "BAD_REQUEST"
      );
      const made = await tx.query.accounts.findMany({
        where: (a, { and, eq }) => and(eq(a.budgetId, seed.budgetId), eq(a.name, "Tomorrow")),
      });
      expect(made).toHaveLength(0);
      // And the seeded transfer payees are untouched.
      const transferPayees = await tx.query.payees.findMany({
        where: and(eq(payees.budgetId, seed.budgetId), isNull(payees.deletedAt)),
      });
      expect(transferPayees.filter((p) => p.targetAccountId !== null)).toHaveLength(4);
    });
  });
});

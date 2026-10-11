/**
 * The YNAB 4 import against a real database: a small `.ynab4` package is read
 * and imported in mirror mode, as the Dropbox sync runs it, inside one
 * transaction that is always rolled back.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TransactionRollbackError, and, eq, sql } from "drizzle-orm";
import {
  accounts,
  categories,
  categoryGroups,
  db,
  householdSplitSettings,
  transactions,
  users,
} from "@znab/db";
import type { ImportTarget } from "../src/lib/ynab4-import";
import { loadBudget, type YfullFile } from "../src/lib/ynab4-package";
import { importBudget, type ImportStats } from "../src/scripts/import-yfull";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Two accounts and a transfer between them, a user and a system group, a split,
 * income, a tombstone, a rename rule, a confined month and a schedule. The
 * diff renames an account and adds a transaction, so the package reader's
 * merge is part of what gets imported.
 */
const snapshot = {
  fileMetaData: { budgetDataVersion: "4.2", currentKnowledge: "A-20" },
  budgetMetaData: { currencyLocale: "en_US", budgetType: "Personal" },
  accounts: [
    { entityType: "account", entityId: "acc-chk", entityVersion: "A-1", accountName: "Checking", accountType: "Checking", onBudget: true, hidden: false, sortableIndex: 10, lastReconciledBalance: null, lastReconciledDate: null, lastEnteredCheckNumber: -1 },
    { entityType: "account", entityId: "acc-visa", entityVersion: "A-2", accountName: "Visa", accountType: "CreditCard", onBudget: true, hidden: false, sortableIndex: 20, lastReconciledBalance: -12.5, lastReconciledDate: "2025-01-31", lastEnteredCheckNumber: -1 },
  ],
  payees: [
    {
      entityType: "payee", entityId: "p-shop", entityVersion: "A-3", name: "Shop", enabled: true,
      renameConditions: [{ entityType: "payeeStringCondition", entityId: "rc1", entityVersion: "A-4", parentPayeeId: "p-shop", operator: "Is", operand: "SHOP 123" }],
    },
    { entityType: "payee", entityId: "Payee/Transfer:acc-visa", entityVersion: "A-5", name: "Transfer : Visa", enabled: true, targetAccountId: "acc-visa" },
    { entityType: "payee", entityId: "Payee/Transfer:acc-chk", entityVersion: "A-6", name: "Transfer : Checking", enabled: true, targetAccountId: "acc-chk" },
  ],
  masterCategories: [
    {
      entityType: "masterCategory", entityId: "mc-bills", entityVersion: "A-7", name: "Bills", type: "OUTFLOW", sortableIndex: 1,
      subCategories: [
        { entityType: "category", entityId: "c-rent", entityVersion: "A-8", name: "Rent", type: "OUTFLOW", masterCategoryId: "mc-bills", cachedBalance: 0, sortableIndex: 1 },
        { entityType: "category", entityId: "c-food", entityVersion: "A-9", name: "Food", type: "OUTFLOW", masterCategoryId: "mc-bills", cachedBalance: 0, sortableIndex: 2 },
      ],
    },
    { entityType: "masterCategory", entityId: "MasterCategory/__Hidden__", entityVersion: "A-10", name: "Hidden Categories", type: "OUTFLOW", sortableIndex: 0, subCategories: [] },
  ],
  monthlyBudgets: [
    {
      entityType: "monthlyBudget", entityId: "MB/2025-01", entityVersion: "A-11", month: "2025-01-01",
      monthlySubCategoryBudgets: [
        { entityType: "monthlyCategoryBudget", entityId: "MCB/2025-01/c-rent", entityVersion: "A-12", categoryId: "c-rent", budgeted: 1000, overspendingHandling: null, parentMonthlyBudgetId: "MB/2025-01" },
        { entityType: "monthlyCategoryBudget", entityId: "MCB/2025-01/c-food", entityVersion: "A-13", categoryId: "c-food", budgeted: 300, overspendingHandling: "Confined", parentMonthlyBudgetId: "MB/2025-01" },
      ],
    },
  ],
  transactions: [
    { entityType: "transaction", entityId: "t-pay", entityVersion: "A-14", accountId: "acc-chk", categoryId: "Category/__ImmediateIncome__", amount: 2000, date: "2025-01-01", cleared: "Reconciled", accepted: true },
    {
      entityType: "transaction", entityId: "t-split", entityVersion: "A-15", accountId: "acc-chk", payeeId: "p-shop", categoryId: "Category/__Split__", amount: -150, date: "2025-01-05", cleared: "Cleared", accepted: true,
      subTransactions: [
        { entityType: "subTransaction", entityId: "s1", entityVersion: "A-16", parentTransactionId: "t-split", categoryId: "c-rent", amount: -100 },
        { entityType: "subTransaction", entityId: "s2", entityVersion: "A-17", parentTransactionId: "t-split", categoryId: "c-food", amount: -50 },
      ],
    },
    { entityType: "transaction", entityId: "t-out", entityVersion: "A-18", accountId: "acc-chk", payeeId: "Payee/Transfer:acc-visa", amount: -25, date: "2025-01-10", cleared: "Uncleared", accepted: true, targetAccountId: "acc-visa", transferTransactionId: "t-in" },
    { entityType: "transaction", entityId: "t-in", entityVersion: "A-19", accountId: "acc-visa", payeeId: "Payee/Transfer:acc-chk", amount: 25, date: "2025-01-10", cleared: "Uncleared", accepted: true, targetAccountId: "acc-chk", transferTransactionId: "t-out" },
    { entityType: "transaction", entityId: "t-gone", entityVersion: "A-20", accountId: "acc-visa", categoryId: "c-food", amount: -9, date: "2025-01-12", cleared: "Uncleared", accepted: true, isTombstone: true },
  ],
  scheduledTransactions: [
    { entityType: "scheduledTransaction", entityId: "st-rent", entityVersion: "A-20", accountId: "acc-chk", payeeId: "p-shop", categoryId: "c-rent", amount: -1000, date: "2025-02-01", frequency: "Monthly", cleared: "Uncleared", accepted: true },
  ],
};

const diff = {
  shortDeviceId: "B",
  startVersion: "A-20",
  endVersion: "A-20,B-2",
  items: [
    { ...snapshot.accounts[0], entityVersion: "B-1", accountName: "Everyday Checking" },
    { entityType: "transaction", entityId: "t-new", entityVersion: "B-2", accountId: "acc-visa", payeeId: "p-shop", categoryId: "c-food", amount: -42.1, date: "2025-01-20", cleared: "Uncleared", accepted: true },
  ],
};

let root: string;
let data: YfullFile;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "znab-import-"));
  const pkg = path.join(root, "Test~0000.ynab4");
  const dataDir = path.join(pkg, "data1~T");
  await mkdir(path.join(dataDir, "devices"), { recursive: true });
  await mkdir(path.join(dataDir, "GUID-A"));
  await mkdir(path.join(dataDir, "GUID-B"));
  const write = (file: string, body: unknown) => writeFile(path.join(pkg, file), JSON.stringify(body));
  await write("Budget.ymeta", { relativeDataFolderName: "data1~T" });
  await write("data1~T/devices/A.ydevice", { shortDeviceId: "A", deviceGUID: "GUID-A", knowledgeInFullBudgetFile: "A-20" });
  await write("data1~T/devices/B.ydevice", { shortDeviceId: "B", deviceGUID: "GUID-B", knowledgeInFullBudgetFile: null });
  await write("data1~T/GUID-A/Budget.yfull", snapshot);
  await write("data1~T/GUID-B/A-20_A-20,B-2.ydiff", diff);
  ({ data } = await loadBudget(pkg));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs `fn` in a transaction that is always rolled back, with the import's logging muted. */
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  } finally {
    log.mockRestore();
  }
}

/** Live and deleted rows of every table the import writes, for one budget. */
async function rowCounts(tx: Tx, budgetId: number) {
  const [row] = (await tx.execute(sql`
    SELECT
      (SELECT count(*) FROM accounts WHERE budget_id = ${budgetId})::int AS accounts,
      (SELECT count(*) FROM category_groups WHERE budget_id = ${budgetId})::int AS category_groups,
      (SELECT count(*) FROM categories WHERE budget_id = ${budgetId})::int AS categories,
      (SELECT count(*) FROM payees WHERE budget_id = ${budgetId})::int AS payees,
      (SELECT count(*) FROM payee_rename_rules WHERE budget_id = ${budgetId})::int AS payee_rename_rules,
      (SELECT count(*) FROM monthly_budgets WHERE budget_id = ${budgetId})::int AS monthly_budgets,
      (SELECT count(*) FROM transactions WHERE budget_id = ${budgetId})::int AS transactions,
      (SELECT count(*) FROM transactions WHERE budget_id = ${budgetId} AND deleted_at IS NOT NULL)::int AS deleted_transactions,
      (SELECT count(*) FROM sub_transactions s JOIN transactions t ON t.id = s.transaction_id WHERE t.budget_id = ${budgetId})::int AS sub_transactions,
      (SELECT count(*) FROM scheduled_transactions WHERE budget_id = ${budgetId})::int AS scheduled_transactions
  `)) as unknown as Record<string, number>[];
  return row!;
}

const total = (stats: ImportStats) => Object.values(stats).reduce((a, b) => a + b, 0);

async function setup(tx: Tx, overwrite: boolean) {
  const slug = `import-${crypto.randomUUID()}`;
  const [user] = await tx.insert(users).values({ slug, displayName: slug }).returning();
  const target: ImportTarget = {
    label: "Test",
    ynabId: `test-${crypto.randomUUID()}`,
    userId: user!.id,
    name: "Imported",
    source: root,
    overwrite,
  };
  return { user: user!, target };
}

describe("YNAB 4 import", () => {
  test("the fixture package merges its diff", () => {
    expect(data.accounts.find((a) => a.entityId === "acc-chk")!.accountName).toBe("Everyday Checking");
    expect(data.transactions.map((t) => t.entityId)).toContain("t-new");
  });

  test("mirror mode is idempotent and keeps znab-only settings", async () => {
    await inRollback(async (tx) => {
      const { user, target } = await setup(tx, true);

      const first = await importBudget(tx, target, data, true);
      const budgetId = first.budgetId;
      const counts = await rowCounts(tx, budgetId);
      expect(counts).toEqual({
        accounts: 2,
        category_groups: 2,
        categories: 2,
        payees: 3,
        payee_rename_rules: 1,
        monthly_budgets: 2,
        transactions: 6,
        deleted_transactions: 1,
        sub_transactions: 2,
        scheduled_transactions: 1,
      });
      expect(total(first.stats)).toBeGreaterThan(0);

      // The same data again writes nothing at all
      const second = await importBudget(tx, target, data, true);
      expect(second.budgetId).toBe(budgetId);
      expect(Object.entries(second.stats).filter(([, n]) => n !== 0)).toEqual([]);
      expect(await rowCounts(tx, budgetId)).toEqual(counts);

      // Settings that exist only in znab, and edits a mirror must undo
      const [rent] = await tx.select().from(categories).where(and(eq(categories.budgetId, budgetId), eq(categories.ynabId, "c-rent")));
      await tx.update(categories).set({ goalType: "TB", goalTarget: "500.00" }).where(eq(categories.id, rent!.id));
      await tx
        .update(categoryGroups)
        .set({ inMasterBudgets: true })
        .where(and(eq(categoryGroups.budgetId, budgetId), eq(categoryGroups.ynabId, "mc-bills")));
      await tx.insert(householdSplitSettings).values({ userId: user.id, primaryBudgetId: budgetId, savingsPercent: "30" });
      const [checking] = await tx.select().from(accounts).where(and(eq(accounts.budgetId, budgetId), eq(accounts.ynabId, "acc-chk")));
      await tx.update(accounts).set({ name: "Renamed in znab", sortOrder: 5 }).where(eq(accounts.id, checking!.id));
      await tx.insert(transactions).values({
        ynabId: crypto.randomUUID(),
        budgetId,
        accountId: checking!.id,
        amount: "-1.00",
        date: "2025-01-15",
      });

      const third = await importBudget(tx, target, data, true);
      expect(third.stats.accounts).toBe(1);
      expect(third.stats["mirror: transactions"]).toBe(1);
      expect(await rowCounts(tx, budgetId)).toEqual(counts);

      const [checkingAfter] = await tx.select().from(accounts).where(eq(accounts.id, checking!.id));
      expect(checkingAfter).toMatchObject({ name: "Everyday Checking", sortOrder: 0 });
      const [rentAfter] = await tx.select().from(categories).where(eq(categories.id, rent!.id));
      expect(rentAfter).toMatchObject({ goalType: "TB", goalTarget: "500.00" });
      const [bills] = await tx
        .select()
        .from(categoryGroups)
        .where(and(eq(categoryGroups.budgetId, budgetId), eq(categoryGroups.ynabId, "mc-bills")));
      expect(bills!.inMasterBudgets).toBe(true);
      const [split] = await tx.select().from(householdSplitSettings).where(eq(householdSplitSettings.userId, user.id));
      expect(split).toMatchObject({ primaryBudgetId: budgetId, savingsPercent: "30.00" });
    });
  });

  test("a plain import never overwrites and is idempotent", async () => {
    await inRollback(async (tx) => {
      const { target } = await setup(tx, false);
      const first = await importBudget(tx, target, data, true);
      const counts = await rowCounts(tx, first.budgetId);

      const [checking] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.budgetId, first.budgetId), eq(accounts.ynabId, "acc-chk")));
      await tx.update(accounts).set({ name: "Edited" }).where(eq(accounts.id, checking!.id));

      const second = await importBudget(tx, target, data, true);
      expect(total(second.stats)).toBe(0);
      expect(await rowCounts(tx, first.budgetId)).toEqual(counts);
      const [after] = await tx.select().from(accounts).where(eq(accounts.id, checking!.id));
      expect(after!.name).toBe("Edited");
    });
  });
});

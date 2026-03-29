/**
 * Import YNAB 4 .yfull files into PostgreSQL.
 *
 * Usage:
 *   bun src/scripts/import-yfull.ts
 *
 * Reads from ../../seed-data/Budget.yfull and Budget-Fiona.yfull
 * Seeds two users: "zach" (owns both budgets) and "demo" (owns a copy of Zach's budget).
 * Fully idempotent — safe to run multiple times.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  eq, and
} from "drizzle-orm";
import * as schema from "@znab/db";
import { isSpecialCategoryId } from "@znab/shared";
import path from "path";

// ─── DB setup ────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");

const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

// ─── YNAB 4 types ─────────────────────────────────────────────────────────────

interface YfullFile {
  fileMetaData: { budgetDataVersion: string; currentKnowledge: string };
  budgetMetaData: { currencyLocale: string; budgetType: string };
  accounts: YnabAccount[];
  payees: YnabPayee[];
  masterCategories: YnabMasterCategory[];
  monthlyBudgets: YnabMonthlyBudget[];
  transactions: YnabTransaction[];
  scheduledTransactions: YnabScheduledTransaction[];
}

interface YnabAccount {
  entityId: string;
  entityVersion: string;
  accountName: string;
  accountType: string;
  onBudget: boolean;
  hidden: boolean;
  sortableIndex: number;
  lastReconciledBalance: number | null;
  lastReconciledDate: string | null;
  lastEnteredCheckNumber: number;
  isTombstone?: boolean;
}

interface YnabPayee {
  entityId: string;
  entityVersion: string;
  name: string;
  targetAccountId?: string | null;
  autoFillCategoryId?: string | null;
  autoFillAmount?: number | null;
  autoFillMemo?: string | null;
  enabled: boolean;
  isTombstone?: boolean;
}

interface YnabMasterCategory {
  entityId: string;
  name: string;
  type: string;
  deleteable?: boolean;
  isTombstone?: boolean;
  subCategories?: YnabSubCategory[];
}

interface YnabSubCategory {
  entityId: string;
  entityVersion: string;
  name: string;
  type: string;
  masterCategoryId: string;
  cachedBalance: number;
  sortableIndex: number;
  isTombstone?: boolean;
}

interface YnabMonthlyBudget {
  entityId: string;
  month: string; // "YYYY-MM-01"
  monthlySubCategoryBudgets: YnabMonthlyCategoryBudget[];
}

interface YnabMonthlyCategoryBudget {
  entityId: string;
  categoryId: string;
  budgeted: number;
  overspendingHandling: string | null;
  parentMonthlyBudgetId: string;
  isTombstone?: boolean;
}

interface YnabTransaction {
  entityId: string;
  entityVersion: string;
  accountId: string;
  payeeId?: string | null;
  categoryId?: string | null;
  amount: number;
  date: string;
  cleared: string;
  accepted: boolean;
  memo?: string | null;
  targetAccountId?: string | null;
  transferTransactionId?: string | null;
  dateEnteredFromSchedule?: string | null;
  subTransactions?: YnabSubTransaction[] | null;
  isTombstone?: boolean;
}

interface YnabSubTransaction {
  entityId: string;
  parentTransactionId: string;
  categoryId?: string | null;
  payeeId?: string | null;
  amount: number;
  memo?: string | null;
  isTombstone?: boolean;
}

interface YnabScheduledTransaction {
  entityId: string;
  accountId: string;
  payeeId?: string | null;
  categoryId?: string | null;
  amount: number;
  date: string;
  frequency: string;
  twiceAMonthStartDay?: number | null;
  memo?: string | null;
  cleared: string;
  accepted: boolean;
  targetAccountId?: string | null;
  isTombstone?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(val: number | null | undefined): string {
  if (val == null) return "0.00";
  return parseFloat(val.toFixed(2)).toFixed(2);
}

function isSystem(masterCategoryId: string): boolean {
  return masterCategoryId.startsWith("MasterCategory/__");
}

const SEED_DATA_DIR = path.resolve(import.meta.dir, "../../../../seed-data");

function loadYfull(filename: string): YfullFile {
  const filePath = path.join(SEED_DATA_DIR, filename);
  console.log(`  Loading ${filePath}`);
  return JSON.parse(require("fs").readFileSync(filePath, "utf8"));
}

// ─── Import a single .yfull file into a budget ────────────────────────────────

async function importYfull(data: YfullFile, budgetId: number) {
  // 1. Accounts
  console.log(`  Importing ${data.accounts.length} accounts...`);
  const accountYnabToId = new Map<string, number>();

  for (const a of data.accounts) {
    const [row] = await db
      .insert(schema.accounts)
      .values({
        ynabId: a.entityId,
        budgetId,
        name: a.accountName,
        accountType: a.accountType,
        onBudget: a.onBudget,
        hidden: a.hidden,
        sortOrder: a.sortableIndex > 1_000_000 ? 9999 : a.sortableIndex,
        lastReconciledBalance: a.lastReconciledBalance != null ? toMoney(a.lastReconciledBalance) : null,
        lastReconciledDate: a.lastReconciledDate ?? null,
        lastEnteredCheckNum: a.lastEnteredCheckNumber >= 0 ? a.lastEnteredCheckNumber : null,
        deletedAt: a.isTombstone ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.accounts.id });

    // fetch existing if skipped by conflict
    const id = row?.id ?? (await db.query.accounts.findFirst({
      where: and(eq(schema.accounts.ynabId, a.entityId), eq(schema.accounts.budgetId, budgetId)),
      columns: { id: true },
    }))!.id;
    accountYnabToId.set(a.entityId, id);
  }

  // 2. Category groups
  console.log(`  Importing ${data.masterCategories.length} category groups...`);
  const groupYnabToId = new Map<string, number>();

  for (const mc of data.masterCategories) {
    const [row] = await db
      .insert(schema.categoryGroups)
      .values({
        ynabId: mc.entityId,
        budgetId,
        name: mc.name,
        type: mc.type ?? "OUTFLOW",
        isSystem: isSystem(mc.entityId),
        deletedAt: mc.isTombstone ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.categoryGroups.id });

    const id = row?.id ?? (await db.query.categoryGroups.findFirst({
      where: and(eq(schema.categoryGroups.ynabId, mc.entityId), eq(schema.categoryGroups.budgetId, budgetId)),
      columns: { id: true },
    }))!.id;
    groupYnabToId.set(mc.entityId, id);
  }

  // 3. Categories (sub-categories nested in masterCategories)
  const allSubCats = data.masterCategories.flatMap((mc) =>
    (mc.subCategories ?? []).map((sc) => ({ ...sc, masterCategoryId: mc.entityId }))
  );
  console.log(`  Importing ${allSubCats.length} categories...`);
  const catYnabToId = new Map<string, number>();

  for (const sc of allSubCats) {
    const groupId = groupYnabToId.get(sc.masterCategoryId);
    if (!groupId) continue;

    const [row] = await db
      .insert(schema.categories)
      .values({
        ynabId: sc.entityId,
        budgetId,
        groupId,
        name: sc.name,
        type: sc.type ?? "OUTFLOW",
        cachedBalance: toMoney(sc.cachedBalance),
        sortOrder: sc.sortableIndex,
        deletedAt: sc.isTombstone ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.categories.id });

    const id = row?.id ?? (await db.query.categories.findFirst({
      where: and(eq(schema.categories.ynabId, sc.entityId), eq(schema.categories.budgetId, budgetId)),
      columns: { id: true },
    }))!.id;
    catYnabToId.set(sc.entityId, id);
  }

  // 4. Payees
  console.log(`  Importing ${data.payees.length} payees...`);
  const payeeYnabToId = new Map<string, number>();

  for (const p of data.payees) {
    const targetAccountId = p.targetAccountId
      ? accountYnabToId.get(p.targetAccountId) ?? null
      : null;
    const autofillCategoryId = p.autoFillCategoryId && !isSpecialCategoryId(p.autoFillCategoryId)
      ? catYnabToId.get(p.autoFillCategoryId) ?? null
      : null;

    const [row] = await db
      .insert(schema.payees)
      .values({
        ynabId: p.entityId,
        budgetId,
        name: p.name,
        targetAccountId,
        autofillCategoryId,
        autofillAmount: p.autoFillAmount != null ? toMoney(p.autoFillAmount) : null,
        autofillMemo: p.autoFillMemo ?? null,
        enabled: p.enabled,
        deletedAt: p.isTombstone ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.payees.id });

    const id = row?.id ?? (await db.query.payees.findFirst({
      where: and(eq(schema.payees.ynabId, p.entityId), eq(schema.payees.budgetId, budgetId)),
      columns: { id: true },
    }))!.id;
    payeeYnabToId.set(p.entityId, id);
  }

  // 5. Monthly budgets
  let mbCount = 0;
  for (const mb of data.monthlyBudgets) {
    for (const sub of mb.monthlySubCategoryBudgets ?? []) {
      const categoryId = isSpecialCategoryId(sub.categoryId)
        ? null
        : catYnabToId.get(sub.categoryId) ?? null;

      await db
        .insert(schema.monthlyBudgets)
        .values({
          ynabId: sub.entityId,
          budgetId,
          categoryId,
          month: mb.month,
          budgeted: toMoney(sub.budgeted),
          overspendingHandling: sub.overspendingHandling ?? null,
          deletedAt: sub.isTombstone ? new Date() : null,
        })
        .onConflictDoNothing();
      mbCount++;
    }
  }
  console.log(`  Imported ${mbCount} monthly budget entries...`);

  // 6. Transactions
  console.log(`  Importing ${data.transactions.length} transactions...`);
  const txnYnabToId = new Map<string, number>();

  // Insert in batches of 200 for performance
  const BATCH = 200;
  for (let i = 0; i < data.transactions.length; i += BATCH) {
    const batch = data.transactions.slice(i, i + BATCH);
    for (const t of batch) {
      const accountId = accountYnabToId.get(t.accountId);
      if (!accountId) continue;

      const catResolved = t.categoryId && !isSpecialCategoryId(t.categoryId)
        ? catYnabToId.get(t.categoryId) ?? null
        : null;
      const transferAccountId = t.targetAccountId
        ? accountYnabToId.get(t.targetAccountId) ?? null
        : null;

      const [row] = await db
        .insert(schema.transactions)
        .values({
          ynabId: t.entityId,
          budgetId,
          accountId,
          payeeId: t.payeeId ? payeeYnabToId.get(t.payeeId) ?? null : null,
          categoryId: catResolved,
          categoryYnabId: t.categoryId ?? null,
          amount: toMoney(t.amount),
          date: t.date,
          cleared: t.cleared ?? "Uncleared",
          accepted: t.accepted ?? true,
          memo: t.memo ?? null,
          isTransfer: !!t.transferTransactionId,
          transferAccountId,
          transferTransactionId: t.transferTransactionId ?? null,
          isSplit: t.categoryId === "Category/__Split__",
          dateFromSchedule: t.dateEnteredFromSchedule ?? null,
          deletedAt: t.isTombstone ? new Date() : null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.transactions.id });

      const id = row?.id ?? (await db.query.transactions.findFirst({
        where: and(eq(schema.transactions.ynabId, t.entityId), eq(schema.transactions.budgetId, budgetId)),
        columns: { id: true },
      }))!.id;
      txnYnabToId.set(t.entityId, id);
    }
    process.stdout.write(`\r    ${Math.min(i + BATCH, data.transactions.length)}/${data.transactions.length}`);
  }
  console.log();

  // 7. Sub-transactions
  let subCount = 0;
  for (const t of data.transactions) {
    if (!t.subTransactions?.length) continue;
    const parentId = txnYnabToId.get(t.entityId);
    if (!parentId) continue;

    for (const sub of t.subTransactions) {
      if (sub.isTombstone) continue;
      const catId = sub.categoryId && !isSpecialCategoryId(sub.categoryId)
        ? catYnabToId.get(sub.categoryId) ?? null
        : null;

      await db
        .insert(schema.subTransactions)
        .values({
          ynabId: sub.entityId,
          transactionId: parentId,
          categoryId: catId,
          categoryYnabId: sub.categoryId ?? null,
          payeeId: sub.payeeId ? payeeYnabToId.get(sub.payeeId) ?? null : null,
          amount: toMoney(sub.amount),
          memo: sub.memo ?? null,
        })
        .onConflictDoNothing();
      subCount++;
    }
  }
  console.log(`  Imported ${subCount} sub-transactions`);

  // 8. Scheduled transactions
  console.log(`  Importing ${data.scheduledTransactions.length} scheduled transactions...`);
  for (const st of data.scheduledTransactions) {
    const accountId = accountYnabToId.get(st.accountId);
    if (!accountId) continue;

    const catId = st.categoryId && !isSpecialCategoryId(st.categoryId)
      ? catYnabToId.get(st.categoryId) ?? null
      : null;

    await db
      .insert(schema.scheduledTransactions)
      .values({
        ynabId: st.entityId,
        budgetId,
        accountId,
        payeeId: st.payeeId ? payeeYnabToId.get(st.payeeId) ?? null : null,
        categoryId: catId,
        categoryYnabId: st.categoryId ?? null,
        amount: toMoney(st.amount),
        date: st.date,
        frequency: st.frequency,
        twiceMonthDay: st.twiceAMonthStartDay ?? null,
        memo: st.memo ?? null,
        cleared: st.cleared ?? "Uncleared",
        accepted: st.accepted ?? true,
        deletedAt: st.isTombstone ? new Date() : null,
      })
      .onConflictDoNothing();
  }
}

// ─── Upsert a budget row, return its id ───────────────────────────────────────

async function upsertBudget(ynabId: string | null, userId: number, name: string): Promise<number> {
  if (ynabId) {
    const existing = await db.query.budgets.findFirst({
      where: eq(schema.budgets.ynabId, ynabId),
      columns: { id: true },
    });
    if (existing) return existing.id;
  }

  const [row] = await db
    .insert(schema.budgets)
    .values({ ynabId, userId, name })
    .onConflictDoNothing()
    .returning({ id: schema.budgets.id });

  return row!.id;
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════╗");
console.log("║   ZNAB — YNAB 4 Import Script        ║");
console.log("╚══════════════════════════════════════╝\n");

// 1. Seed users
console.log("Step 1: Seeding users...");
await db.insert(schema.users).values([
  { slug: "zach", displayName: "Zach" },
  { slug: "demo", displayName: "Demo" },
]).onConflictDoNothing();

const zachUser = await db.query.users.findFirst({ where: eq(schema.users.slug, "zach") });
const demoUser = await db.query.users.findFirst({ where: eq(schema.users.slug, "demo") });

if (!zachUser || !demoUser) throw new Error("Failed to seed users");
console.log(`  ✓ Users ready (zach: id=${zachUser.id}, demo: id=${demoUser.id})\n`);

// 2. Import Zach's budget
console.log("Step 2: Importing Budget.yfull (Zach)...");
const zachData = loadYfull("Budget.yfull");
const zachBudgetId = await upsertBudget("zach-main", zachUser.id, "Zach's Budget");
await importYfull(zachData, zachBudgetId);
console.log("  ✓ Zach's budget imported\n");

// 3. Import Fiona's budget
console.log("Step 3: Importing Budget-Fiona.yfull (Fiona)...");
const fionaData = loadYfull("Budget-Fiona.yfull");
const fionaBudgetId = await upsertBudget("fiona-main", zachUser.id, "Fiona's Budget");
await importYfull(fionaData, fionaBudgetId);
console.log("  ✓ Fiona's budget imported\n");

// 4. Import Demo budget
console.log("Step 4: Importing Demo.yfull (Demo)...");
const demoData = loadYfull("Demo.yfull");
const demoBudgetId = await upsertBudget("demo-main", demoUser.id, "Demo Budget");
await importYfull(demoData, demoBudgetId);
console.log("  ✓ Demo budget imported\n");

console.log("╔══════════════════════════════════════╗");
console.log("║   Import complete!                   ║");
console.log("╚══════════════════════════════════════╝");

await client.end();
process.exit(0);

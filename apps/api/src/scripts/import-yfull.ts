/**
 * Import YNAB 4 budgets into PostgreSQL.
 *
 * Usage (from the repo root):
 *   bun import
 *
 * Zach's and Fiona's budgets are read from live `.ynab4` packages, as synced
 * from Dropbox, set by YNAB_ZACH_PACKAGE and YNAB_FIONA_PACKAGE (relative paths
 * resolve from the repo root). Each defaults to its package under seed-data/,
 * and a path ending in .yfull is read as a flat snapshot instead.
 *
 * YNAB 4 is the source of truth for those two budgets: every run upserts each
 * entity by its YNAB id, overwriting rows that changed and applying tombstones.
 * The Demo budget is only ever inserted into, so edits made to it survive, and
 * is skipped altogether when YNAB_SKIP_DEMO=1 (as the Dropbox sync sets it).
 * Each budget is imported in its own transaction. Safe to run repeatedly.
 */

import { eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@znab/db";
import { db } from "@znab/db";
import { isSpecialCategoryId, PAYEE_RENAME_OPERATORS } from "@znab/shared";
import path from "path";
import { isSystemGroupYnabId } from "../lib/category";
import { loadBudget, staleSubTransactionIds, type YfullFile } from "../lib/ynab4-package";

type Database = typeof db;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

export interface ImportOptions {
  /**
   * Overwrite rows whose YNAB data changed, and delete sub-transactions YNAB
   * tombstoned. Off, rows already present are left as they are.
   */
  overwrite: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(val: number | null | undefined): string {
  if (val == null) return "0.00";
  return parseFloat(val.toFixed(2)).toFixed(2);
}

const BATCH = 500;

/**
 * Inserts rows in batches, keyed on `target`. With overwrite, a row that
 * already exists is updated only when one of its imported columns differs, so
 * an unchanged budget writes nothing. A deletion keeps its original timestamp.
 * Sort order is only set on insert: reordering happens in znab, and a sync
 * every few minutes would otherwise keep undoing it.
 * Returns the number of rows inserted or updated.
 */
async function upsertRows(
  tx: DbOrTx,
  table: PgTable,
  rows: Record<string, unknown>[],
  target: PgColumn[],
  { overwrite }: ImportOptions
): Promise<number> {
  if (!rows.length) return 0;
  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const targetNames = new Set(target.map((c) => c.name));
  const keys = Object.keys(rows[0]!).filter((k) => k !== "sortOrder" && !targetNames.has(columns[k]!.name));
  const excluded = (col: PgColumn) => sql.raw(`excluded."${col.name}"`);

  const set: Record<string, SQL> = { updatedAt: sql`now()` };
  const changed: SQL[] = [];
  for (const key of keys) {
    const col = columns[key]!;
    if (key === "deletedAt") {
      set[key] = sql`CASE WHEN ${excluded(col)} IS NULL THEN NULL ELSE COALESCE(${col}, ${excluded(col)}) END`;
      changed.push(sql`(${col} IS NULL) IS DISTINCT FROM (${excluded(col)} IS NULL)`);
    } else {
      set[key] = excluded(col);
      changed.push(sql`${col} IS DISTINCT FROM ${excluded(col)}`);
    }
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const insert = tx.insert(table).values(rows.slice(i, i + BATCH) as never);
    const query = overwrite
      ? insert.onConflictDoUpdate({ target, set, setWhere: sql.join(changed, sql` OR `) })
      : insert.onConflictDoNothing();
    const result = await query.returning({ one: sql<number>`1` });
    written += result.length;
  }
  return written;
}

/** Every row of a budget-scoped table, by YNAB id. */
async function idsByYnabId(
  tx: DbOrTx,
  table: PgTable & { id: PgColumn; ynabId: PgColumn; budgetId: PgColumn },
  budgetId: number
): Promise<Map<string, number>> {
  const rows = await tx
    .select({ id: table.id, ynabId: table.ynabId })
    .from(table)
    .where(eq(table.budgetId, budgetId));
  return new Map(rows.map((r) => [r.ynabId as string, r.id as number]));
}

/** Runs one import step with start and completion logging. */
async function step<T>(label: string, run: () => Promise<T>, describe: (result: T) => string): Promise<T> {
  console.log(`  [${label}] start`);
  const startedAt = performance.now();
  const result = await run();
  console.log(`  [${label}] complete: ${describe(result)} (${Math.round(performance.now() - startedAt)}ms)`);
  return result;
}

const summarize = (total: number, written: number) => `${total} in YNAB, ${written} inserted or updated`;

// ─── Import one budget's data ─────────────────────────────────────────────────

export async function importBudgetData(
  tx: DbOrTx,
  budgetId: number,
  data: YfullFile,
  options: ImportOptions = { overwrite: true }
): Promise<void> {
  // 1. Accounts
  // YNAB 4's sortableIndex is a binary-subdivision key spread across the whole
  // int32 range, so nothing about the numbers themselves means anything beyond
  // the order they put the accounts in. Ranked densely from 0 here, which is
  // the order the sidebar can then sort by.
  const accountRank = new Map(
    [...data.accounts]
      .sort((x, y) => x.sortableIndex - y.sortableIndex)
      .map((a, index) => [a.entityId, index] as const)
  );
  await step(
    "accounts",
    () =>
      upsertRows(
        tx,
        schema.accounts,
        data.accounts.map((a) => ({
          ynabId: a.entityId,
          budgetId,
          name: a.accountName,
          accountType: a.accountType,
          onBudget: a.onBudget,
          hidden: a.hidden,
          sortOrder: accountRank.get(a.entityId)!,
          lastReconciledBalance: a.lastReconciledBalance != null ? toMoney(a.lastReconciledBalance) : null,
          lastReconciledDate: a.lastReconciledDate ?? null,
          lastEnteredCheckNum: a.lastEnteredCheckNumber >= 0 ? a.lastEnteredCheckNumber : null,
          deletedAt: a.isTombstone ? new Date() : null,
        })),
        [schema.accounts.ynabId, schema.accounts.budgetId],
        options
      ),
    (n) => summarize(data.accounts.length, n)
  );
  const accountYnabToId = await idsByYnabId(tx, schema.accounts, budgetId);

  // 2. Category groups
  // A master category's sortableIndex is the same binary-subdivision key the
  // accounts carry, so only the order it puts them in means anything. The
  // system groups are parked after the user's own so a reorder of those can
  // never interleave with them: nothing shows them in the grid, and the
  // register's picker reads better with them last.
  const groupRank = new Map(
    [...data.masterCategories]
      .sort((x, y) => x.sortableIndex - y.sortableIndex)
      .reduce<[string, number][]>((acc, mc) => {
        const system = isSystemGroupYnabId(mc.entityId);
        const taken = acc.filter(([, o]) => (system ? o >= 9000 : o < 9000)).length;
        acc.push([mc.entityId, system ? 9000 + taken : taken]);
        return acc;
      }, [])
  );
  await step(
    "category groups",
    () =>
      upsertRows(
        tx,
        schema.categoryGroups,
        data.masterCategories.map((mc) => ({
          ynabId: mc.entityId,
          budgetId,
          name: mc.name,
          type: mc.type ?? "OUTFLOW",
          isSystem: isSystemGroupYnabId(mc.entityId),
          sortOrder: groupRank.get(mc.entityId)!,
          deletedAt: mc.isTombstone ? new Date() : null,
        })),
        [schema.categoryGroups.ynabId, schema.categoryGroups.budgetId],
        options
      ),
    (n) => summarize(data.masterCategories.length, n)
  );
  const groupYnabToId = await idsByYnabId(tx, schema.categoryGroups, budgetId);

  // 3. Categories (sub-categories nested in masterCategories)
  // Ranked densely within each group, which is the only place a category's
  // order means anything. The raw key runs to within a few thousand of the
  // int4 ceiling, so a category added later at one past the maximum would
  // overflow the column.
  const catRank = new Map<string, number>();
  for (const mc of data.masterCategories) {
    [...(mc.subCategories ?? [])]
      .sort((x, y) => x.sortableIndex - y.sortableIndex)
      .forEach((sc, index) => catRank.set(sc.entityId, index));
  }
  const allSubCats = data.masterCategories.flatMap((mc) =>
    (mc.subCategories ?? []).map((sc) => ({ ...sc, masterCategoryId: mc.entityId }))
  );
  await step(
    "categories",
    () =>
      upsertRows(
        tx,
        schema.categories,
        allSubCats
          .filter((sc) => groupYnabToId.has(sc.masterCategoryId))
          .map((sc) => ({
            ynabId: sc.entityId,
            budgetId,
            groupId: groupYnabToId.get(sc.masterCategoryId)!,
            name: sc.name,
            type: sc.type ?? "OUTFLOW",
            cachedBalance: toMoney(sc.cachedBalance),
            sortOrder: catRank.get(sc.entityId) ?? 0,
            deletedAt: sc.isTombstone ? new Date() : null,
          })),
        [schema.categories.ynabId, schema.categories.budgetId],
        options
      ),
    (n) => summarize(allSubCats.length, n)
  );
  const catYnabToId = await idsByYnabId(tx, schema.categories, budgetId);
  const resolveCategory = (ynabId: string | null | undefined) =>
    ynabId && !isSpecialCategoryId(ynabId) ? catYnabToId.get(ynabId) ?? null : null;

  // 4. Payees
  await step(
    "payees",
    () =>
      upsertRows(
        tx,
        schema.payees,
        data.payees.map((p) => ({
          ynabId: p.entityId,
          budgetId,
          name: p.name,
          targetAccountId: p.targetAccountId ? accountYnabToId.get(p.targetAccountId) ?? null : null,
          autofillCategoryId: resolveCategory(p.autoFillCategoryId),
          autofillAmount: p.autoFillAmount != null ? toMoney(p.autoFillAmount) : null,
          autofillMemo: p.autoFillMemo ?? null,
          enabled: p.enabled,
          deletedAt: p.isTombstone ? new Date() : null,
        })),
        [schema.payees.ynabId, schema.payees.budgetId],
        options
      ),
    (n) => summarize(data.payees.length, n)
  );
  const payeeYnabToId = await idsByYnabId(tx, schema.payees, budgetId);

  // 5. Payee rename rules, which YNAB 4 nests inside the payee they rename to
  const knownOperators = new Set<string>(PAYEE_RENAME_OPERATORS);
  const renameRows: Record<string, unknown>[] = [];
  let renameSkipped = 0;
  for (const p of data.payees) {
    for (const c of p.renameConditions ?? []) {
      const payeeId = payeeYnabToId.get(c.parentPayeeId);
      // A rule with no payee to rename to, or nothing to match on, is inert
      if (!payeeId || !c.operand?.trim()) continue;
      // The operator column is free text, so an operator outside the vocabulary
      // the matcher knows would import a rule that can never fire
      if (!knownOperators.has(c.operator)) {
        console.warn(`  Skipping rename rule ${c.entityId}: unknown operator "${c.operator}"`);
        renameSkipped++;
        continue;
      }
      renameRows.push({
        ynabId: c.entityId,
        budgetId,
        payeeId,
        operator: c.operator,
        operand: c.operand,
        deletedAt: c.isTombstone ? new Date() : null,
      });
    }
  }
  await step(
    "payee rename rules",
    () =>
      upsertRows(tx, schema.payeeRenameRules, renameRows, [schema.payeeRenameRules.ynabId, schema.payeeRenameRules.budgetId], options),
    (n) => summarize(renameRows.length, n) + (renameSkipped ? `, ${renameSkipped} skipped for an unknown operator` : "")
  );

  // 6. Monthly budgets
  // A category holds one row a month. Should YNAB carry two for the same one
  // the live entry wins, else the latest.
  const mcbByCategoryMonth = new Map<string, Record<string, unknown>>();
  const mcbRows: Record<string, unknown>[] = [];
  for (const mb of data.monthlyBudgets) {
    for (const sub of mb.monthlySubCategoryBudgets ?? []) {
      const categoryId = resolveCategory(sub.categoryId);
      const row = {
        ynabId: sub.entityId,
        budgetId,
        categoryId,
        month: mb.month,
        budgeted: toMoney(sub.budgeted),
        overspendingHandling: sub.overspendingHandling ?? null,
        deletedAt: sub.isTombstone ? new Date() : null,
      };
      if (categoryId == null) {
        mcbRows.push(row);
        continue;
      }
      const key = `${categoryId}:${mb.month}`;
      const held = mcbByCategoryMonth.get(key);
      if (!held || held.deletedAt || !row.deletedAt) mcbByCategoryMonth.set(key, row);
    }
  }
  mcbRows.push(...mcbByCategoryMonth.values());
  await step(
    "monthly budgets",
    async () => {
      if (options.overwrite) await adoptMonthlyBudgetRows(tx, budgetId, mcbRows);
      return upsertRows(tx, schema.monthlyBudgets, mcbRows, [schema.monthlyBudgets.ynabId, schema.monthlyBudgets.budgetId], options);
    },
    (n) => summarize(mcbRows.length, n)
  );

  // 7. Transactions
  const txnRows = data.transactions
    .filter((t) => accountYnabToId.has(t.accountId))
    .map((t) => ({
      ynabId: t.entityId,
      budgetId,
      accountId: accountYnabToId.get(t.accountId)!,
      payeeId: t.payeeId ? payeeYnabToId.get(t.payeeId) ?? null : null,
      categoryId: resolveCategory(t.categoryId),
      categoryYnabId: t.categoryId ?? null,
      amount: toMoney(t.amount),
      date: t.date,
      cleared: t.cleared ?? "Uncleared",
      accepted: t.accepted ?? true,
      memo: t.memo ?? null,
      isTransfer: !!t.transferTransactionId,
      transferAccountId: t.targetAccountId ? accountYnabToId.get(t.targetAccountId) ?? null : null,
      transferTransactionId: t.transferTransactionId ?? null,
      isSplit: t.categoryId === "Category/__Split__",
      dateFromSchedule: t.dateEnteredFromSchedule ?? null,
      deletedAt: t.isTombstone ? new Date() : null,
    }));
  await step(
    "transactions",
    () => upsertRows(tx, schema.transactions, txnRows, [schema.transactions.ynabId, schema.transactions.budgetId], options),
    (n) => summarize(data.transactions.length, n)
  );
  const txnYnabToId = await idsByYnabId(tx, schema.transactions, budgetId);

  // 8. Sub-transactions
  // YNAB 4 drops a removed sub-transaction from its parent rather than
  // tombstoning it, so each split is reconciled against YNAB's current list:
  // rows YNAB no longer holds, or holds as tombstones, are deleted outright.
  // Nothing references a sub-transaction row, and nothing in the app soft
  // deletes one, so there is no history to keep.
  const subRows: Record<string, unknown>[] = [];
  const liveSubs = new Map<number, Set<string>>();
  for (const t of data.transactions) {
    const parentId = txnYnabToId.get(t.entityId);
    if (!parentId) continue;
    const live = new Set<string>();
    liveSubs.set(parentId, live);
    // A transaction that is no longer a split keeps no sub-transactions
    if (t.categoryId !== "Category/__Split__") continue;
    for (const sub of t.subTransactions ?? []) {
      if (sub.isTombstone) continue;
      live.add(sub.entityId);
      subRows.push({
        ynabId: sub.entityId,
        transactionId: parentId,
        categoryId: resolveCategory(sub.categoryId),
        categoryYnabId: sub.categoryId ?? null,
        payeeId: sub.payeeId ? payeeYnabToId.get(sub.payeeId) ?? null : null,
        amount: toMoney(sub.amount),
        memo: sub.memo ?? null,
      });
    }
  }
  await step(
    "sub-transactions",
    async () => {
      const written = await upsertRows(tx, schema.subTransactions, subRows, [schema.subTransactions.ynabId, schema.subTransactions.transactionId], options);
      let deleted = 0;
      if (options.overwrite) {
        const existing = await tx
          .select({
            id: schema.subTransactions.id,
            transactionId: schema.subTransactions.transactionId,
            ynabId: schema.subTransactions.ynabId,
          })
          .from(schema.subTransactions)
          .innerJoin(schema.transactions, eq(schema.transactions.id, schema.subTransactions.transactionId))
          .where(eq(schema.transactions.budgetId, budgetId));
        const stale = staleSubTransactionIds(existing, liveSubs);
        for (let i = 0; i < stale.length; i += BATCH) {
          const gone = await tx
            .delete(schema.subTransactions)
            .where(inArray(schema.subTransactions.id, stale.slice(i, i + BATCH)))
            .returning({ id: schema.subTransactions.id });
          deleted += gone.length;
        }
      }
      return { written, deleted };
    },
    ({ written, deleted }) => `${summarize(subRows.length, written)}, ${deleted} no longer in YNAB deleted`
  );

  // 9. Scheduled transactions
  const schedRows = data.scheduledTransactions
    .filter((st) => accountYnabToId.has(st.accountId))
    .map((st) => ({
      ynabId: st.entityId,
      budgetId,
      accountId: accountYnabToId.get(st.accountId)!,
      payeeId: st.payeeId ? payeeYnabToId.get(st.payeeId) ?? null : null,
      categoryId: resolveCategory(st.categoryId),
      categoryYnabId: st.categoryId ?? null,
      amount: toMoney(st.amount),
      date: st.date,
      frequency: st.frequency,
      // Only TwiceAMonth means anything by this. YNAB 4 writes a 0 on every
      // other frequency, and `?? null` keeps a 0.
      twiceMonthDay: st.frequency === "TwiceAMonth" ? st.twiceAMonthStartDay || null : null,
      memo: st.memo ?? null,
      cleared: st.cleared ?? "Uncleared",
      accepted: st.accepted ?? true,
      deletedAt: st.isTombstone ? new Date() : null,
    }));
  await step(
    "scheduled transactions",
    () =>
      upsertRows(tx, schema.scheduledTransactions, schedRows, [schema.scheduledTransactions.ynabId, schema.scheduledTransactions.budgetId], options),
    (n) => summarize(data.scheduledTransactions.length, n)
  );
}

/**
 * znab keys a monthly budget it creates itself as MCB/<month>/<znab category
 * id>, while YNAB keys the same category and month by its own id. Both rows
 * cannot exist under the one-per-category-month constraint, so a znab row that
 * YNAB now has an entry for takes on YNAB's id, and the upsert then overwrites it.
 */
async function adoptMonthlyBudgetRows(tx: DbOrTx, budgetId: number, rows: Record<string, unknown>[]) {
  const existing = await tx
    .select({
      id: schema.monthlyBudgets.id,
      ynabId: schema.monthlyBudgets.ynabId,
      categoryId: schema.monthlyBudgets.categoryId,
      month: schema.monthlyBudgets.month,
    })
    .from(schema.monthlyBudgets)
    .where(eq(schema.monthlyBudgets.budgetId, budgetId));
  const taken = new Set(existing.map((r) => r.ynabId));
  const byCategoryMonth = new Map(existing.filter((r) => r.categoryId != null).map((r) => [`${r.categoryId}:${r.month}`, r]));

  let adopted = 0;
  for (const row of rows) {
    if (row.categoryId == null) continue;
    const held = byCategoryMonth.get(`${row.categoryId}:${row.month}`);
    const ynabId = row.ynabId as string;
    if (!held || held.ynabId === ynabId || taken.has(ynabId)) continue;
    await tx.update(schema.monthlyBudgets).set({ ynabId }).where(eq(schema.monthlyBudgets.id, held.id));
    taken.add(ynabId);
    adopted++;
  }
  if (adopted) console.log(`    re-keyed ${adopted} znab monthly budget rows to their YNAB ids`);
}

// ─── Upsert a budget row, return its id ───────────────────────────────────────

export async function upsertBudget(tx: DbOrTx, ynabId: string, userId: number, name: string): Promise<number> {
  const existing = await tx
    .select({ id: schema.budgets.id })
    .from(schema.budgets)
    .where(eq(schema.budgets.ynabId, ynabId));
  if (existing[0]) return existing[0].id;

  const [row] = await tx
    .insert(schema.budgets)
    .values({ ynabId, userId, name })
    .returning({ id: schema.budgets.id });
  return row!.id;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");
const SEED_DATA_DIR = path.join(REPO_ROOT, "seed-data");

async function main(): Promise<number> {
  console.log("ZNAB: YNAB 4 import\n");

  console.log("Seeding users...");
  await db.insert(schema.users).values([
    { slug: "zach", displayName: "Zach" },
    { slug: "demo", displayName: "Demo" },
  ]).onConflictDoNothing();
  const [zachUser] = await db.select().from(schema.users).where(eq(schema.users.slug, "zach"));
  const [demoUser] = await db.select().from(schema.users).where(eq(schema.users.slug, "demo"));
  if (!zachUser || !demoUser) throw new Error("Failed to seed users");
  console.log(`  Users ready (zach: id=${zachUser.id}, demo: id=${demoUser.id})\n`);

  const source = (envVar: string, fallback: string) => path.resolve(REPO_ROOT, process.env[envVar] || path.join(SEED_DATA_DIR, fallback));
  const budgets = [
    { label: "Zach", ynabId: "zach-main", userId: zachUser.id, name: "Zach's Budget", source: source("YNAB_ZACH_PACKAGE", "Zach_s Budget~85D0690E.ynab4"), overwrite: true },
    { label: "Fiona", ynabId: "fiona-main", userId: zachUser.id, name: "Fiona's Budget", source: source("YNAB_FIONA_PACKAGE", "Fiona Budget~F53B2AA3.ynab4"), overwrite: true },
    { label: "Demo", ynabId: "demo-main", userId: demoUser.id, name: "Demo Budget", source: path.join(SEED_DATA_DIR, "Demo.yfull"), overwrite: false },
  ].filter((b) => b.label !== "Demo" || process.env.YNAB_SKIP_DEMO !== "1");

  let failures = 0;
  for (const b of budgets) {
    console.log(`Importing ${b.label} from ${b.source}`);
    try {
      // Read and merge before touching the database, so a half-synced package
      // fails here and leaves the last good import in place
      const { data, summary } = await loadBudget(b.source);
      console.log(
        `  Read snapshot ${summary.baseDevice ? `from device ${summary.baseDevice} ` : ""}at ${summary.baseKnowledge}; ` +
          `applied ${summary.diffsApplied} of ${summary.diffsTotal} diffs (${summary.itemsApplied} items, ${summary.tombstonesApplied} tombstones)`
      );
      for (const w of summary.warnings) console.warn(`  Warning: ${w}`);
      if (summary.unknownTypes.length) console.warn(`  Ignored entity types: ${summary.unknownTypes.join(", ")}`);
      if (summary.orphansDropped) console.warn(`  Dropped ${summary.orphansDropped} entities whose parent is missing`);

      await db.transaction(async (tx) => {
        const budgetId = await upsertBudget(tx, b.ynabId, b.userId, b.name);
        await importBudgetData(tx, budgetId, data, { overwrite: b.overwrite });
      });
      console.log(`  ${b.label} imported\n`);
    } catch (err) {
      failures++;
      console.error(`  ${b.label} import failed, nothing was written:`, err);
      console.log();
    }
  }

  console.log(failures ? `Import finished with ${failures} failed budget(s)` : "Import complete");
  return failures ? 1 : 0;
}

if (import.meta.main) {
  let code = 1;
  try {
    code = await main();
  } catch (err) {
    console.error("Import failed:", err);
  } finally {
    await db.$client.end();
  }
  process.exit(code);
}

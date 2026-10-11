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
 * YNAB_MIRROR=1 (also set by the sync) goes further for the two YNAB budgets:
 * every edit made in znab is undone, including rows znab created and its own
 * sort order, so each budget ends up exactly as YNAB 4 has it.
 * Each budget is imported in its own transaction. Safe to run repeatedly.
 *
 * How each YNAB entity maps to a row lives in `lib/ynab4-import.ts`; this file
 * only writes. Importing it has no side effects: the CLI runs under
 * `import.meta.main`, so a test can call `importBudget` on a transaction.
 */

import { eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@znab/db";
import { db } from "@znab/db";
import path from "node:path";
import {
  accountRows,
  categoryGroupRows,
  categoryResolver,
  categoryRows,
  type IdMap,
  type ImportContext,
  type ImportTarget,
  importTargets,
  mirrorRequested,
  monthlyBudgetRows,
  payeeRows,
  type RowRefs,
  renameRuleRows,
  scheduledTransactionRows,
  subCategoryCount,
  subTransactionRows,
  transactionRows,
} from "../lib/ynab4-import";
import { assertMirrorable, knownYnabIds, planMirrorDeletes, type MirrorRows } from "../lib/ynab4-mirror";
import {
  loadBudget,
  splitScheduleDescriptions,
  staleSubTransactionIds,
  type YfullFile,
} from "../lib/ynab4-package";

type Database = typeof db;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

export interface ImportOptions {
  /**
   * Overwrite rows whose YNAB data changed, and delete sub-transactions YNAB
   * tombstoned. Off, rows already present are left as they are.
   */
  overwrite: boolean;
  /**
   * Also undo every edit made in znab: sort order and the fields YNAB carries
   * that the plain import leaves alone are overwritten, and rows YNAB does not
   * know are deleted. Requires overwrite. Settings that exist only in znab
   * (goals, Master Budgets, the household split) are kept.
   */
  mirror?: boolean;
}

/** Rows each step inserted, updated or deleted, by step label. All zero when nothing changed. */
export type ImportStats = Record<string, number>;

// ─── Writing helpers ──────────────────────────────────────────────────────────

const BATCH = 500;

type BudgetTable = PgTable & { id: PgColumn; ynabId: PgColumn; budgetId: PgColumn };

/**
 * Inserts rows in batches, keyed on `target`. With overwrite, a row that
 * already exists is updated only when one of its imported columns differs, so
 * an unchanged budget writes nothing. A deletion keeps its original timestamp.
 * Sort order is only set on insert: reordering happens in znab, and a sync
 * every few minutes would otherwise keep undoing it. A mirror undoes it on purpose.
 * Returns the number of rows inserted or updated.
 */
async function upsertRows(
  tx: DbOrTx,
  table: PgTable,
  rows: readonly object[],
  target: PgColumn[],
  { overwrite, mirror }: ImportOptions
): Promise<number> {
  if (!rows.length) return 0;
  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const targetNames = new Set(target.map((c) => c.name));
  const keys = Object.keys(rows[0]!).filter((k) => (mirror || k !== "sortOrder") && !targetNames.has(columns[k]!.name));
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

/** Deletes the rows whose `column` is one of `ids`, returning how many went. */
async function deleteWhereIn(tx: DbOrTx, table: PgTable, column: PgColumn, ids: number[]): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const gone = await tx.delete(table).where(inArray(column, ids.slice(i, i + BATCH))).returning({ one: sql<number>`1` });
    deleted += gone.length;
  }
  return deleted;
}

/** Nulls the reference `key` wherever it points at one of `ids`, returning how many rows changed. */
async function clearReferences(tx: DbOrTx, table: PgTable, key: string, ids: number[]): Promise<number> {
  const column = (getTableColumns(table) as Record<string, PgColumn>)[key]!;
  let cleared = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const changed = await tx
      .update(table)
      .set({ [key]: null } as never)
      .where(inArray(column, ids.slice(i, i + BATCH)))
      .returning({ one: sql<number>`1` });
    cleared += changed.length;
  }
  return cleared;
}

/** Every row of a budget-scoped table, by YNAB id. */
async function idsByYnabId(tx: DbOrTx, table: BudgetTable, budgetId: number): Promise<Map<string, number>> {
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

/** What every step of one budget's import shares. */
interface Run {
  tx: DbOrTx;
  data: YfullFile;
  ctx: ImportContext;
  options: ImportOptions;
  stats: ImportStats;
}

/** Upserts one table's rows on (budget, YNAB id) as a logged step, recording the count. */
async function upsertStep(
  run: Run,
  label: string,
  table: BudgetTable,
  rows: readonly object[],
  total: number,
  extra = ""
): Promise<void> {
  run.stats[label] = await step(
    label,
    () => upsertRows(run.tx, table, rows, [table.budgetId, table.ynabId], run.options),
    (n) => summarize(total, n) + extra
  );
}

async function importAccounts(run: Run): Promise<IdMap> {
  await upsertStep(run, "accounts", schema.accounts, accountRows(run.data, run.ctx), run.data.accounts.length);
  return idsByYnabId(run.tx, schema.accounts, run.ctx.budgetId);
}

async function importCategoryGroups(run: Run): Promise<IdMap> {
  const rows = categoryGroupRows(run.data, run.ctx);
  await upsertStep(run, "category groups", schema.categoryGroups, rows, run.data.masterCategories.length);
  return idsByYnabId(run.tx, schema.categoryGroups, run.ctx.budgetId);
}

async function importCategories(run: Run, groups: IdMap): Promise<IdMap> {
  const rows = categoryRows(run.data, run.ctx, groups);
  await upsertStep(run, "categories", schema.categories, rows, subCategoryCount(run.data));
  return idsByYnabId(run.tx, schema.categories, run.ctx.budgetId);
}

async function importPayees(run: Run, refs: Pick<RowRefs, "accounts" | "resolveCategory">): Promise<IdMap> {
  await upsertStep(run, "payees", schema.payees, payeeRows(run.data, run.ctx, refs), run.data.payees.length);
  return idsByYnabId(run.tx, schema.payees, run.ctx.budgetId);
}

async function importPayeeRenameRules(run: Run, payees: IdMap): Promise<void> {
  const { rows, skipped } = renameRuleRows(run.data, run.ctx, payees);
  // The operator is checked against the vocabulary the matcher knows, so a
  // rule outside it would be one that can never fire
  for (const c of skipped) console.warn(`  Skipping rename rule ${c.entityId}: unknown operator "${c.operator}"`);
  const extra = skipped.length ? `, ${skipped.length} skipped for an unknown operator` : "";
  await upsertStep(run, "payee rename rules", schema.payeeRenameRules, rows, rows.length, extra);
}

async function importMonthlyBudgets(run: Run, refs: Pick<RowRefs, "resolveCategory">): Promise<void> {
  const rows = monthlyBudgetRows(run.data, run.ctx, refs.resolveCategory);
  if (run.options.overwrite) await adoptMonthlyBudgetRows(run.tx, run.ctx.budgetId, rows);
  await upsertStep(run, "monthly budgets", schema.monthlyBudgets, rows, rows.length);
}

async function importTransactions(run: Run, refs: RowRefs): Promise<IdMap> {
  const rows = transactionRows(run.data, run.ctx, refs);
  await upsertStep(run, "transactions", schema.transactions, rows, run.data.transactions.length);
  return idsByYnabId(run.tx, schema.transactions, run.ctx.budgetId);
}

/**
 * Split parts. YNAB 4 drops a removed part from its parent rather than
 * tombstoning it, so each split is reconciled against YNAB's current list:
 * rows YNAB no longer holds, or holds as tombstones, are deleted outright.
 * Nothing references a sub-transaction row, and nothing in the app soft
 * deletes one, so there is no history to keep.
 */
async function importSubTransactions(run: Run, transactions: IdMap, refs: RowRefs): Promise<void> {
  const { tx, ctx, options } = run;
  const { rows, live } = subTransactionRows(run.data, transactions, refs);
  const { written, deleted } = await step(
    "sub-transactions",
    async () => {
      const target = [schema.subTransactions.transactionId, schema.subTransactions.ynabId];
      const written = await upsertRows(tx, schema.subTransactions, rows, target, options);
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
          .where(eq(schema.transactions.budgetId, ctx.budgetId));
        deleted = await deleteWhereIn(tx, schema.subTransactions, schema.subTransactions.id, staleSubTransactionIds(existing, live));
      }
      return { written, deleted };
    },
    (r) => `${summarize(rows.length, r.written)}, ${r.deleted} no longer in YNAB deleted`
  );
  run.stats["sub-transactions"] = written;
  run.stats["sub-transactions deleted"] = deleted;
}

/**
 * Scheduled transactions. znab has no table for scheduled split parts, so a
 * split schedule arrives as its parent alone and is entered as one
 * uncategorised transaction. Said out loud rather than dropped silently until
 * that gap is closed.
 */
async function importScheduledTransactions(run: Run, refs: RowRefs): Promise<void> {
  const splitSchedules = splitScheduleDescriptions(run.data);
  if (splitSchedules.length) {
    console.warn(`  Warning: ${splitSchedules.length} split scheduled transaction(s) imported without their split parts:`);
    for (const s of splitSchedules) console.warn(`    ${s}`);
  }
  const rows = scheduledTransactionRows(run.data, run.ctx, refs);
  await upsertStep(run, "scheduled transactions", schema.scheduledTransactions, rows, run.data.scheduledTransactions.length);
}

/**
 * Imports one budget's YNAB data into the budget row `budgetId`, step by step
 * in dependency order. Returns what each step wrote.
 */
export async function importBudgetData(
  tx: DbOrTx,
  budgetId: number,
  data: YfullFile,
  options: ImportOptions = { overwrite: true }
): Promise<ImportStats> {
  if (options.mirror) {
    if (!options.overwrite) throw new Error("Mirror mode requires overwrite");
    assertMirrorable(data);
  }
  const run: Run = { tx, data, options, ctx: { budgetId, mirror: !!options.mirror, now: new Date() }, stats: {} };

  const accounts = await importAccounts(run);
  const groups = await importCategoryGroups(run);
  const resolveCategory = categoryResolver(await importCategories(run, groups));
  const payees = await importPayees(run, { accounts, resolveCategory });
  const refs: RowRefs = { accounts, payees, resolveCategory };
  await importPayeeRenameRules(run, payees);
  await importMonthlyBudgets(run, refs);
  const transactions = await importTransactions(run, refs);
  await importSubTransactions(run, transactions, refs);
  await importScheduledTransactions(run, refs);
  if (options.mirror) await removeZnabRows(run);
  return run.stats;
}

/**
 * Deletes every row of the budget that YNAB does not know, which is every row
 * znab created: each is keyed by a fresh uuid or an id derived from one, and
 * a monthly budget row YNAB also has was re-keyed to YNAB's id above. Runs
 * after the upsert, which has already pointed every row YNAB knows back at
 * YNAB's own parents. Children go before their parents, and a reference a
 * kept row still holds to a removed one is cleared rather than left to fail.
 */
async function removeZnabRows({ tx, data, ctx, stats }: Run) {
  const ofBudget = (table: BudgetTable, extra: Record<string, PgColumn> = {}) =>
    tx.select({ id: table.id, ynabId: table.ynabId, ...extra }).from(table).where(eq(table.budgetId, ctx.budgetId));
  const rows = {
    accounts: await ofBudget(schema.accounts),
    categoryGroups: await ofBudget(schema.categoryGroups),
    categories: await ofBudget(schema.categories, { groupId: schema.categories.groupId }),
    payees: await ofBudget(schema.payees),
    payeeRenameRules: await ofBudget(schema.payeeRenameRules, { payeeId: schema.payeeRenameRules.payeeId }),
    monthlyBudgets: await ofBudget(schema.monthlyBudgets, { categoryId: schema.monthlyBudgets.categoryId }),
    transactions: await ofBudget(schema.transactions, { accountId: schema.transactions.accountId }),
    scheduledTransactions: await ofBudget(schema.scheduledTransactions, { accountId: schema.scheduledTransactions.accountId }),
  } as MirrorRows;
  const gone = planMirrorDeletes(rows, knownYnabIds(data));

  const record = async (label: string, run: () => Promise<number>, describe: (n: number) => string) => {
    stats[label] = await step(label, run, describe);
  };
  const remove = (label: string, table: PgTable, column: PgColumn, ids: number[]) =>
    record(`mirror: ${label}`, () => deleteWhereIn(tx, table, column, ids), (n) => `${n} created in znab removed`);
  const clear = async (table: PgTable, refs: [string, number[]][]) => {
    let cleared = 0;
    for (const [key, ids] of refs) cleared += await clearReferences(tx, table, key, ids);
    return cleared;
  };

  await remove("sub-transactions", schema.subTransactions, schema.subTransactions.transactionId, gone.transactions);
  await remove("transactions", schema.transactions, schema.transactions.id, gone.transactions);
  await remove("scheduled transactions", schema.scheduledTransactions, schema.scheduledTransactions.id, gone.scheduledTransactions);
  await remove("monthly budgets", schema.monthlyBudgets, schema.monthlyBudgets.id, gone.monthlyBudgets);
  await remove("payee rename rules", schema.payeeRenameRules, schema.payeeRenameRules.id, gone.payeeRenameRules);
  // Only YNAB's rows are left in these tables, and the upsert gave them YNAB's
  // references, so this should find nothing
  await record(
    "mirror: references",
    async () =>
      (await clear(schema.transactions, [["payeeId", gone.payees], ["categoryId", gone.categories], ["transferAccountId", gone.accounts]])) +
      (await clear(schema.subTransactions, [["payeeId", gone.payees], ["categoryId", gone.categories]])) +
      (await clear(schema.scheduledTransactions, [["payeeId", gone.payees], ["categoryId", gone.categories]])),
    (n) => `${n} kept rows pointing at a removed one cleared`
  );
  await remove("payees", schema.payees, schema.payees.id, gone.payees);
  await record(
    "mirror: payee references",
    () => clear(schema.payees, [["targetAccountId", gone.accounts], ["autofillCategoryId", gone.categories]]),
    (n) => `${n} kept payees pointing at a removed row cleared`
  );
  await remove("categories", schema.categories, schema.categories.id, gone.categories);
  await remove("category groups", schema.categoryGroups, schema.categoryGroups.id, gone.categoryGroups);
  await remove("accounts", schema.accounts, schema.accounts.id, gone.accounts);
}

/**
 * znab keys a monthly budget it creates itself as MCB/<month>/<znab category
 * id>, while YNAB keys the same category and month by its own id. Both rows
 * cannot exist under the one-per-category-month constraint, so a znab row that
 * YNAB now has an entry for takes on YNAB's id, and the upsert then overwrites it.
 */
async function adoptMonthlyBudgetRows(tx: DbOrTx, budgetId: number, rows: schema.NewMonthlyBudget[]) {
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
    const ynabId = row.ynabId;
    if (!held || held.ynabId === ynabId || taken.has(ynabId)) continue;
    await tx.update(schema.monthlyBudgets).set({ ynabId }).where(eq(schema.monthlyBudgets.id, held.id));
    taken.add(ynabId);
    adopted++;
  }
  if (adopted) console.log(`    re-keyed ${adopted} znab monthly budget rows to their YNAB ids`);
}

// ─── One budget, end to end ───────────────────────────────────────────────────

/** The budget row keyed `ynabId`, created on first import. Returns its id. */
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

/**
 * Imports already loaded YNAB data into the target's budget row on `tx`, as
 * the CLI does for each budget. A mirror applies only to a budget YNAB owns.
 */
export async function importBudget(
  tx: DbOrTx,
  target: ImportTarget,
  data: YfullFile,
  mirror: boolean
): Promise<{ budgetId: number; stats: ImportStats }> {
  const budgetId = await upsertBudget(tx, target.ynabId, target.userId, target.name);
  const stats = await importBudgetData(tx, budgetId, data, { overwrite: target.overwrite, mirror: target.overwrite && mirror });
  return { budgetId, stats };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");

/** Seeds the two users and imports every target budget. Returns the exit code. */
export async function main(env: Record<string, string | undefined> = process.env): Promise<number> {
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

  const targets = importTargets(env, { zach: zachUser.id, demo: demoUser.id }, REPO_ROOT);
  const mirror = mirrorRequested(env);
  if (mirror) console.log("Mirror mode: edits made in znab to the YNAB budgets are undone\n");

  let failures = 0;
  for (const b of targets) {
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

      await db.transaction((tx) => importBudget(tx, b, data, mirror));
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


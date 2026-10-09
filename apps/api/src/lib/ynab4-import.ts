/**
 * The YNAB 4 import's mapping rules: how each YNAB entity becomes a znab row,
 * and which budgets a run imports. Pure, so every rule can be tested without a
 * database; `scripts/import-yfull.ts` does the writing.
 */

import path from "node:path";
import type {
  NewAccount,
  NewCategory,
  NewCategoryGroup,
  NewMonthlyBudget,
  NewPayee,
  NewPayeeRenameRule,
  NewScheduledTransaction,
  NewSubTransaction,
  NewTransaction,
} from "@znab/db";
import { FLAG_COLORS, isSpecialCategoryId, PAYEE_RENAME_OPERATORS, SPLIT_CATEGORY_ID } from "@znab/shared";
import { isSystemGroupYnabId } from "./category";
import type { YfullFile, YnabRenameCondition } from "./ynab4-package";

export interface ImportContext {
  budgetId: number;
  /**
   * Mirror mode: rows also take the fields a plain import leaves to znab (an
   * account note, a transaction flag, a schedule's pinned day).
   */
  mirror: boolean;
  /** Stamped on every row YNAB tombstoned. */
  now: Date;
}

/** znab row ids by YNAB id, for one table of the budget being imported. */
export type IdMap = ReadonlyMap<string, number>;

/** Resolves a YNAB category id to a znab category id, or null. */
export type CategoryResolver = (ynabId: string | null | undefined) => number | null;

/** The references a transaction-like row needs resolved. */
export interface RowRefs {
  accounts: IdMap;
  payees: IdMap;
  resolveCategory: CategoryResolver;
}

/**
 * A YNAB amount as numeric(12,2) text. The round trip through parseFloat turns
 * a rounded -0 ("-0.00") into "0.00".
 */
export function toMoney(val: number | null | undefined): string {
  if (val == null) return "0.00";
  return parseFloat(val.toFixed(2)).toFixed(2);
}

const deletedAt = (ctx: ImportContext, entity: { isTombstone?: boolean }) => (entity.isTombstone ? ctx.now : null);

// ─── Sort order ───────────────────────────────────────────────────────────────

/**
 * YNAB 4's sortableIndex is a binary-subdivision key spread across the whole
 * int32 range, so nothing about the numbers means anything beyond the order
 * they put things in. Ranked densely from 0, which is the order znab sorts by;
 * the raw key runs close enough to the int4 ceiling that a row added later at
 * one past the maximum would overflow the column.
 */
export function denseRanks(list: readonly { entityId: string; sortableIndex: number }[]): Map<string, number> {
  return new Map(
    [...list].sort((x, y) => x.sortableIndex - y.sortableIndex).map((e, index) => [e.entityId, index] as const)
  );
}

/** Where YNAB 4's own groups start, parked after any the user could make. */
export const SYSTEM_GROUP_RANK = 9000;

/**
 * Category groups ranked like `denseRanks`, with the system groups parked
 * after the user's own so a reorder of those can never interleave with them:
 * nothing shows them in the grid, and the register's picker reads better with
 * them last.
 */
export function groupRanks(masterCategories: YfullFile["masterCategories"]): Map<string, number> {
  let user = 0;
  let system = 0;
  const ranks = new Map<string, number>();
  for (const mc of [...masterCategories].sort((x, y) => x.sortableIndex - y.sortableIndex)) {
    ranks.set(mc.entityId, isSystemGroupYnabId(mc.entityId) ? SYSTEM_GROUP_RANK + system++ : user++);
  }
  return ranks;
}

// ─── Row mappers, in import order ─────────────────────────────────────────────

export function accountRows(data: YfullFile, ctx: ImportContext): NewAccount[] {
  const rank = denseRanks(data.accounts);
  return data.accounts.map((a) => ({
    ynabId: a.entityId,
    budgetId: ctx.budgetId,
    name: a.accountName,
    accountType: a.accountType,
    onBudget: a.onBudget,
    hidden: a.hidden,
    sortOrder: rank.get(a.entityId)!,
    lastReconciledBalance: a.lastReconciledBalance != null ? toMoney(a.lastReconciledBalance) : null,
    lastReconciledDate: a.lastReconciledDate ?? null,
    lastEnteredCheckNum: a.lastEnteredCheckNumber >= 0 ? a.lastEnteredCheckNumber : null,
    ...(ctx.mirror ? { note: a.note ?? null } : {}),
    deletedAt: deletedAt(ctx, a),
  }));
}

export function categoryGroupRows(data: YfullFile, ctx: ImportContext): NewCategoryGroup[] {
  const rank = groupRanks(data.masterCategories);
  return data.masterCategories.map((mc) => ({
    ynabId: mc.entityId,
    budgetId: ctx.budgetId,
    name: mc.name,
    type: mc.type ?? "OUTFLOW",
    isSystem: isSystemGroupYnabId(mc.entityId),
    sortOrder: rank.get(mc.entityId)!,
    deletedAt: deletedAt(ctx, mc),
  }));
}

/** Every category YNAB nests in a master category, live or not. */
export const subCategoryCount = (data: YfullFile): number =>
  data.masterCategories.reduce((n, mc) => n + (mc.subCategories?.length ?? 0), 0);

/**
 * Categories, ranked densely within their group (the only place their order
 * means anything). One whose group did not import is left out.
 */
export function categoryRows(data: YfullFile, ctx: ImportContext, groups: IdMap): NewCategory[] {
  const rank = new Map<string, number>();
  for (const mc of data.masterCategories) {
    for (const [id, index] of denseRanks(mc.subCategories ?? [])) rank.set(id, index);
  }
  return data.masterCategories.flatMap((mc) => {
    const groupId = groups.get(mc.entityId);
    if (groupId == null) return [];
    return (mc.subCategories ?? []).map((sc) => ({
      ynabId: sc.entityId,
      budgetId: ctx.budgetId,
      groupId,
      name: sc.name,
      type: sc.type ?? "OUTFLOW",
      cachedBalance: toMoney(sc.cachedBalance),
      sortOrder: rank.get(sc.entityId) ?? 0,
      deletedAt: deletedAt(ctx, sc),
    }));
  });
}

/** A category id resolved to its row; YNAB's special ids (income, split) have none. */
export function categoryResolver(categories: IdMap): CategoryResolver {
  return (ynabId) => (ynabId && !isSpecialCategoryId(ynabId) ? categories.get(ynabId) ?? null : null);
}

export function payeeRows(
  data: YfullFile,
  ctx: ImportContext,
  refs: Pick<RowRefs, "accounts" | "resolveCategory">
): NewPayee[] {
  return data.payees.map((p) => ({
    ynabId: p.entityId,
    budgetId: ctx.budgetId,
    name: p.name,
    targetAccountId: p.targetAccountId ? refs.accounts.get(p.targetAccountId) ?? null : null,
    autofillCategoryId: refs.resolveCategory(p.autoFillCategoryId),
    autofillAmount: p.autoFillAmount != null ? toMoney(p.autoFillAmount) : null,
    autofillMemo: p.autoFillMemo ?? null,
    enabled: p.enabled,
    deletedAt: deletedAt(ctx, p),
  }));
}

/**
 * Payee rename rules, which YNAB 4 nests inside the payee they rename to. A
 * rule with no payee to rename to, or nothing to match on, is inert and left
 * out. One whose operator the matcher does not know could never fire, so it is
 * returned in `skipped` instead.
 */
export function renameRuleRows(
  data: YfullFile,
  ctx: ImportContext,
  payees: IdMap
): { rows: NewPayeeRenameRule[]; skipped: YnabRenameCondition[] } {
  const known = new Set<string>(PAYEE_RENAME_OPERATORS);
  const rows: NewPayeeRenameRule[] = [];
  const skipped: YnabRenameCondition[] = [];
  for (const p of data.payees) {
    for (const c of p.renameConditions ?? []) {
      const payeeId = payees.get(c.parentPayeeId);
      if (!payeeId || !c.operand?.trim()) continue;
      if (!known.has(c.operator)) {
        skipped.push(c);
        continue;
      }
      rows.push({
        ynabId: c.entityId,
        budgetId: ctx.budgetId,
        payeeId,
        operator: c.operator,
        operand: c.operand,
        deletedAt: deletedAt(ctx, c),
      });
    }
  }
  return { rows, skipped };
}

/**
 * Monthly budget rows. A category holds one row a month: should YNAB carry two
 * for the same one, the live entry wins, else the latest. A row whose category
 * did not resolve is kept as it is.
 */
export function monthlyBudgetRows(
  data: YfullFile,
  ctx: ImportContext,
  resolveCategory: CategoryResolver
): NewMonthlyBudget[] {
  const byCategoryMonth = new Map<string, NewMonthlyBudget>();
  const rows: NewMonthlyBudget[] = [];
  for (const mb of data.monthlyBudgets) {
    for (const sub of mb.monthlySubCategoryBudgets ?? []) {
      const categoryId = resolveCategory(sub.categoryId);
      const row: NewMonthlyBudget = {
        ynabId: sub.entityId,
        budgetId: ctx.budgetId,
        categoryId,
        month: mb.month,
        budgeted: toMoney(sub.budgeted),
        overspendingHandling: sub.overspendingHandling ?? null,
        deletedAt: deletedAt(ctx, sub),
      };
      if (categoryId == null) {
        rows.push(row);
        continue;
      }
      const key = `${categoryId}:${mb.month}`;
      const held = byCategoryMonth.get(key);
      if (!held || held.deletedAt || !row.deletedAt) byCategoryMonth.set(key, row);
    }
  }
  rows.push(...byCategoryMonth.values());
  return rows;
}

/** Transactions on an account that imported; the rest are left out. */
export function transactionRows(data: YfullFile, ctx: ImportContext, refs: RowRefs): NewTransaction[] {
  const flagColors = new Set<string>(FLAG_COLORS);
  return data.transactions
    .filter((t) => refs.accounts.has(t.accountId))
    .map((t) => ({
      ynabId: t.entityId,
      budgetId: ctx.budgetId,
      accountId: refs.accounts.get(t.accountId)!,
      payeeId: t.payeeId ? refs.payees.get(t.payeeId) ?? null : null,
      categoryId: refs.resolveCategory(t.categoryId),
      categoryYnabId: t.categoryId ?? null,
      amount: toMoney(t.amount),
      date: t.date,
      cleared: t.cleared ?? "Uncleared",
      accepted: t.accepted ?? true,
      memo: t.memo ?? null,
      isTransfer: !!t.transferTransactionId,
      transferAccountId: t.targetAccountId ? refs.accounts.get(t.targetAccountId) ?? null : null,
      transferTransactionId: t.transferTransactionId ?? null,
      isSplit: t.categoryId === SPLIT_CATEGORY_ID,
      dateFromSchedule: t.dateEnteredFromSchedule ?? null,
      // YNAB leaves the flag out while there is none, which is every
      // transaction these budgets hold, so only a mirror takes it over a flag
      // set in znab
      ...(ctx.mirror ? { flagColor: t.flag && flagColors.has(t.flag) ? t.flag : null } : {}),
      deletedAt: deletedAt(ctx, t),
    }));
}

/**
 * The live split parts of every imported transaction, and for each imported
 * transaction the YNAB ids of the parts it should keep (none once it is no
 * longer a split). YNAB 4 drops a removed part rather than tombstoning it, so
 * the import deletes any part not in `live` (see `staleSubTransactionIds`).
 */
export function subTransactionRows(
  data: YfullFile,
  transactions: IdMap,
  refs: Pick<RowRefs, "payees" | "resolveCategory">
): { rows: NewSubTransaction[]; live: Map<number, Set<string>> } {
  const rows: NewSubTransaction[] = [];
  const live = new Map<number, Set<string>>();
  for (const t of data.transactions) {
    const parentId = transactions.get(t.entityId);
    if (!parentId) continue;
    const keep = new Set<string>();
    live.set(parentId, keep);
    if (t.categoryId !== SPLIT_CATEGORY_ID) continue;
    for (const sub of t.subTransactions ?? []) {
      if (sub.isTombstone) continue;
      keep.add(sub.entityId);
      rows.push({
        ynabId: sub.entityId,
        transactionId: parentId,
        categoryId: refs.resolveCategory(sub.categoryId),
        categoryYnabId: sub.categoryId ?? null,
        payeeId: sub.payeeId ? refs.payees.get(sub.payeeId) ?? null : null,
        amount: toMoney(sub.amount),
        memo: sub.memo ?? null,
      });
    }
  }
  return { rows, live };
}

/** Scheduled transactions on an account that imported; the rest are left out. */
export function scheduledTransactionRows(
  data: YfullFile,
  ctx: ImportContext,
  refs: RowRefs
): NewScheduledTransaction[] {
  return data.scheduledTransactions
    .filter((st) => refs.accounts.has(st.accountId))
    .map((st) => ({
      ynabId: st.entityId,
      budgetId: ctx.budgetId,
      accountId: refs.accounts.get(st.accountId)!,
      payeeId: st.payeeId ? refs.payees.get(st.payeeId) ?? null : null,
      categoryId: refs.resolveCategory(st.categoryId),
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
      // Pinned in znab when a schedule's date is edited there. YNAB has only
      // the date, so a mirror unpins it and the day is read off that again.
      ...(ctx.mirror ? { anchorDay: null } : {}),
      deletedAt: deletedAt(ctx, st),
    }));
}

// ─── Which budgets a run imports ──────────────────────────────────────────────

export interface ImportTarget {
  label: string;
  /** The budget row's own key, not an id from inside YNAB. */
  ynabId: string;
  userId: number;
  name: string;
  /** A `.ynab4` package directory, or a flat `.yfull` file. */
  source: string;
  /** YNAB is the source of truth; off, rows already present are left alone. */
  overwrite: boolean;
}

type Env = Record<string, string | undefined>;

/**
 * The budgets a run imports, as the environment asks. `scripts/sync-ynab4.sh`
 * depends on these names: YNAB_ZACH_PACKAGE and YNAB_FIONA_PACKAGE point at
 * the live packages (a relative path resolves from the repo root), and
 * YNAB_SKIP_DEMO=1 leaves the Demo budget out.
 */
export function importTargets(env: Env, users: { zach: number; demo: number }, repoRoot: string): ImportTarget[] {
  const seedData = path.join(repoRoot, "seed-data");
  const source = (envVar: string, fallback: string) =>
    path.resolve(repoRoot, env[envVar] || path.join(seedData, fallback));
  const targets: ImportTarget[] = [
    { label: "Zach", ynabId: "zach-main", userId: users.zach, name: "Zach's Budget", source: source("YNAB_ZACH_PACKAGE", "Zach_s Budget~85D0690E.ynab4"), overwrite: true },
    { label: "Fiona", ynabId: "fiona-main", userId: users.zach, name: "Fiona's Budget", source: source("YNAB_FIONA_PACKAGE", "Fiona Budget~F53B2AA3.ynab4"), overwrite: true },
    { label: "Demo", ynabId: "demo-main", userId: users.demo, name: "Demo Budget", source: path.join(seedData, "Demo.yfull"), overwrite: false },
  ];
  return targets.filter((b) => b.label !== "Demo" || env.YNAB_SKIP_DEMO !== "1");
}

/** YNAB_MIRROR=1, which only the Dropbox sync sets: a plain run never deletes znab's work. */
export const mirrorRequested = (env: Env): boolean => env.YNAB_MIRROR === "1";

/**
 * Mirror mode for the YNAB 4 import: works out which rows of a budget znab
 * created itself, so the import can remove them and leave the budget exactly
 * as YNAB 4 has it.
 */

import type { YfullFile } from "./ynab4-package";

type Row = { id: number; ynabId: string };

/** The rows of one budget, with the references that cannot be left dangling. */
export interface MirrorRows {
  accounts: Row[];
  categoryGroups: Row[];
  categories: (Row & { groupId: number })[];
  payees: Row[];
  payeeRenameRules: (Row & { payeeId: number })[];
  monthlyBudgets: (Row & { categoryId: number | null })[];
  transactions: (Row & { accountId: number })[];
  scheduledTransactions: (Row & { accountId: number })[];
}

export type MirrorTable = keyof MirrorRows;

/**
 * Every YNAB id the data names, tombstones included: a row YNAB deleted is
 * soft deleted by the upsert, so it is not the mirror's to remove.
 */
export function knownYnabIds(data: YfullFile): Record<MirrorTable, Set<string>> {
  const ids = <T extends { entityId: string }>(list: T[]) => new Set(list.map((e) => e.entityId));
  return {
    accounts: ids(data.accounts),
    categoryGroups: ids(data.masterCategories),
    categories: ids(data.masterCategories.flatMap((mc) => mc.subCategories ?? [])),
    payees: ids(data.payees),
    payeeRenameRules: ids(data.payees.flatMap((p) => p.renameConditions ?? [])),
    monthlyBudgets: ids(data.monthlyBudgets.flatMap((mb) => mb.monthlySubCategoryBudgets ?? [])),
    transactions: ids(data.transactions),
    scheduledTransactions: ids(data.scheduledTransactions),
  };
}

/**
 * The ids of the rows to remove from each table: those YNAB does not know,
 * plus any row whose required parent is being removed, which could not
 * otherwise outlive it.
 */
export function planMirrorDeletes(rows: MirrorRows, known: Record<MirrorTable, Set<string>>): Record<MirrorTable, number[]> {
  const doomed = <R extends Row>(table: MirrorTable, orphaned: (row: R) => boolean = () => false) =>
    (rows[table] as R[]).filter((r) => !known[table].has(r.ynabId) || orphaned(r)).map((r) => r.id);

  const accounts = doomed("accounts");
  const categoryGroups = doomed("categoryGroups");
  const payees = doomed("payees");
  const goneAccounts = new Set(accounts);
  const goneGroups = new Set(categoryGroups);
  const gonePayees = new Set(payees);
  const categories = doomed<MirrorRows["categories"][number]>("categories", (r) => goneGroups.has(r.groupId));
  const goneCategories = new Set(categories);

  return {
    accounts,
    categoryGroups,
    categories,
    payees,
    payeeRenameRules: doomed<MirrorRows["payeeRenameRules"][number]>("payeeRenameRules", (r) => gonePayees.has(r.payeeId)),
    monthlyBudgets: doomed<MirrorRows["monthlyBudgets"][number]>(
      "monthlyBudgets",
      (r) => r.categoryId != null && goneCategories.has(r.categoryId)
    ),
    transactions: doomed<MirrorRows["transactions"][number]>("transactions", (r) => goneAccounts.has(r.accountId)),
    scheduledTransactions: doomed<MirrorRows["scheduledTransactions"][number]>("scheduledTransactions", (r) =>
      goneAccounts.has(r.accountId)
    ),
  };
}

/**
 * Refuses data that would empty a budget. A package read half way through a
 * Dropbox sync, or a reader bug, must never be taken as "YNAB has nothing".
 */
export function assertMirrorable(data: YfullFile): void {
  const live = <T extends { isTombstone?: boolean }>(list: T[]) => list.filter((e) => !e.isTombstone).length;
  if (!live(data.accounts)) throw new Error("Mirror refused: the YNAB data has no live accounts");
  if (!live(data.transactions)) throw new Error("Mirror refused: the YNAB data has no live transactions");
}

/**
 * Reads a live YNAB 4 budget package (a `.ynab4` directory, as synced from
 * Dropbox) into the same shape as a flat Budget.yfull.
 *
 * A package holds one Budget.yfull snapshot per desktop device plus a trail of
 * .ydiff files, one per sync. The freshest snapshot is taken as the base and
 * every diff it does not already know about is layered on top. Tombstones are
 * kept so the importer can apply them.
 */

import { readFile, readdir, stat } from "fs/promises";
import path from "path";

// ─── YNAB 4 entity shapes (the fields the importer reads) ─────────────────────

export interface YfullFile {
  fileMetaData: { budgetDataVersion: string; currentKnowledge: string };
  budgetMetaData: { currencyLocale: string; budgetType: string };
  accounts: YnabAccount[];
  payees: YnabPayee[];
  masterCategories: YnabMasterCategory[];
  monthlyBudgets: YnabMonthlyBudget[];
  transactions: YnabTransaction[];
  scheduledTransactions: YnabScheduledTransaction[];
}

export interface YnabAccount {
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

export interface YnabPayee {
  entityId: string;
  entityVersion: string;
  name: string;
  targetAccountId?: string | null;
  autoFillCategoryId?: string | null;
  autoFillAmount?: number | null;
  autoFillMemo?: string | null;
  enabled: boolean;
  // Absent in Demo.yfull, null on most payees elsewhere
  renameConditions?: YnabRenameCondition[] | null;
  isTombstone?: boolean;
}

export interface YnabRenameCondition {
  entityId: string;
  entityVersion: string;
  parentPayeeId: string;
  // Is | Contains | StartsWith | EndsWith, though only Is occurs in this data
  operator: string;
  operand: string;
  isTombstone?: boolean;
}

export interface YnabMasterCategory {
  entityId: string;
  name: string;
  type: string;
  sortableIndex: number;
  deleteable?: boolean;
  isTombstone?: boolean;
  subCategories?: YnabSubCategory[];
}

export interface YnabSubCategory {
  entityId: string;
  entityVersion: string;
  name: string;
  type: string;
  masterCategoryId: string;
  cachedBalance: number;
  sortableIndex: number;
  isTombstone?: boolean;
}

export interface YnabMonthlyBudget {
  entityId: string;
  month: string; // "YYYY-MM-01"
  monthlySubCategoryBudgets: YnabMonthlyCategoryBudget[];
  isTombstone?: boolean;
}

export interface YnabMonthlyCategoryBudget {
  entityId: string;
  categoryId: string;
  budgeted: number;
  overspendingHandling: string | null;
  parentMonthlyBudgetId: string;
  isTombstone?: boolean;
}

export interface YnabTransaction {
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

export interface YnabSubTransaction {
  entityId: string;
  parentTransactionId: string;
  categoryId?: string | null;
  payeeId?: string | null;
  amount: number;
  memo?: string | null;
  isTombstone?: boolean;
}

export interface YnabScheduledTransaction {
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

export interface YdiffFile {
  shortDeviceId: string;
  startVersion: string;
  endVersion: string;
  items: Entity[];
}

type Entity = { entityType?: string; entityId: string; entityVersion?: string; isTombstone?: boolean } & Record<string, unknown>;

// ─── Knowledge (version vectors) ──────────────────────────────────────────────

/** A version vector such as "A-5459,B-83,H-15136", device letter to counter. */
export type Knowledge = Map<string, number>;

/** Splits "H-15136" into its device and counter. */
function parseVersion(version: string): [string, number] {
  const dash = version.lastIndexOf("-");
  return [version.slice(0, dash), Number(version.slice(dash + 1))];
}

export function parseKnowledge(text: string | null | undefined): Knowledge {
  const k: Knowledge = new Map();
  for (const part of (text ?? "").split(",")) {
    if (!part.trim()) continue;
    const [device, n] = parseVersion(part.trim());
    k.set(device, Math.max(k.get(device) ?? 0, n));
  }
  return k;
}

export function formatKnowledge(k: Knowledge): string {
  return [...k.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, n]) => `${d}-${n}`)
    .join(",");
}

/** True when the knowledge already holds this entity version. */
export function knows(k: Knowledge, version: string | undefined): boolean {
  // An entity with no version cannot be placed, so it is always applied
  if (!version) return false;
  const [device, n] = parseVersion(version);
  return (k.get(device) ?? 0) >= n;
}

/** True when `a` holds everything `b` does. */
export function covers(a: Knowledge, b: Knowledge): boolean {
  for (const [d, n] of b) if ((a.get(d) ?? 0) < n) return false;
  return true;
}

function total(k: Knowledge): number {
  let sum = 0;
  for (const n of k.values()) sum += n;
  return sum;
}

// ─── Entity layout ────────────────────────────────────────────────────────────

const TOP_LEVEL: Record<string, keyof YfullFile> = {
  account: "accounts",
  payee: "payees",
  masterCategory: "masterCategories",
  monthlyBudget: "monthlyBudgets",
  transaction: "transactions",
  scheduledTransaction: "scheduledTransactions",
};

/**
 * Entities a yfull nests inside a parent but a ydiff carries on their own,
 * pointing back at the parent by id.
 */
const CHILDREN: { type: string; parentType: string; parentKeys: string[]; arrayKey: string }[] = [
  { type: "category", parentType: "masterCategory", parentKeys: ["masterCategoryId"], arrayKey: "subCategories" },
  { type: "payeeStringCondition", parentType: "payee", parentKeys: ["parentPayeeId"], arrayKey: "renameConditions" },
  { type: "payeeLocation", parentType: "payee", parentKeys: ["parentPayeeId"], arrayKey: "locations" },
  { type: "location", parentType: "payee", parentKeys: ["parentPayeeId"], arrayKey: "locations" },
  { type: "monthlyCategoryBudget", parentType: "monthlyBudget", parentKeys: ["parentMonthlyBudgetId"], arrayKey: "monthlySubCategoryBudgets" },
  { type: "subTransaction", parentType: "transaction", parentKeys: ["parentTransactionId"], arrayKey: "subTransactions" },
  {
    type: "scheduledSubTransaction",
    parentType: "scheduledTransaction",
    parentKeys: ["parentScheduledTransactionId", "parentTransactionId"],
    arrayKey: "subTransactions",
  },
];

const CHILD_BY_TYPE = new Map(CHILDREN.map((c) => [c.type, c]));
/** The child kinds each parent type nests, by array key. */
const CHILD_ARRAYS = new Map<string, { arrayKey: string; childType: string }[]>();
for (const c of CHILDREN) {
  const list = CHILD_ARRAYS.get(c.parentType) ?? [];
  list.push({ arrayKey: c.arrayKey, childType: c.type });
  CHILD_ARRAYS.set(c.parentType, list);
}

// ─── Merge ────────────────────────────────────────────────────────────────────

export interface MergeStats {
  diffsTotal: number;
  diffsApplied: number;
  itemsApplied: number;
  tombstonesApplied: number;
  orphansDropped: number;
  unknownTypes: string[];
  warnings: string[];
}

/**
 * Layers diffs onto a base snapshot. An item is applied only when the base
 * knowledge does not already hold its version; diffs are applied in causal
 * order so the latest write to an entity wins.
 */
export function applyDiffs(
  base: YfullFile,
  diffs: YdiffFile[],
  baseKnowledge: Knowledge = parseKnowledge(base.fileMetaData?.currentKnowledge)
): { data: YfullFile; stats: MergeStats } {
  const stats: MergeStats = {
    diffsTotal: diffs.length,
    diffsApplied: 0,
    itemsApplied: 0,
    tombstonesApplied: 0,
    orphansDropped: 0,
    unknownTypes: [],
    warnings: [],
  };
  const unknown = new Set<string>();

  // Every entity by type then id, children stripped out of their parents
  const store = new Map<string, Map<string, Entity>>();
  const bucket = (type: string) => {
    let m = store.get(type);
    if (!m) store.set(type, (m = new Map()));
    return m;
  };
  let budgetMetaData = base.budgetMetaData;

  /**
   * Stores an entity and the children nested in it. With `accept`, only the
   * entities it passes are stored, though nested children are still checked
   * one by one. Returns the entities stored.
   */
  const put = (type: string, entity: Entity, parentId?: string, accept?: (e: Entity) => boolean): Entity[] => {
    const copy: Entity = { ...entity, entityType: type };
    const child = CHILD_BY_TYPE.get(type);
    // Remember the parent on the child itself, so the rebuild can find it
    if (child && parentId && !child.parentKeys.some((k) => copy[k])) copy[child.parentKeys[0]!] = parentId;
    const stored: Entity[] = [];
    for (const { arrayKey, childType } of CHILD_ARRAYS.get(type) ?? []) {
      const nested = copy[arrayKey];
      delete copy[arrayKey];
      // An empty or missing array in a diff says nothing about the children,
      // which travel as their own items; only entries present are applied.
      if (Array.isArray(nested)) {
        for (const c of nested as Entity[]) stored.push(...put(childType, c, copy.entityId, accept));
      }
    }
    if (!accept || accept(copy)) {
      bucket(type).set(copy.entityId, copy);
      stored.push(copy);
    }
    return stored;
  };

  for (const [type, key] of Object.entries(TOP_LEVEL)) {
    for (const e of (base[key] as unknown as Entity[] | undefined) ?? []) put(type, e);
  }

  const known: Knowledge = new Map(baseKnowledge);
  const ordered = [...diffs].sort(
    (a, b) =>
      total(parseKnowledge(a.startVersion)) - total(parseKnowledge(b.startVersion)) ||
      a.shortDeviceId.localeCompare(b.shortDeviceId) ||
      total(parseKnowledge(a.endVersion)) - total(parseKnowledge(b.endVersion))
  );

  for (const diff of ordered) {
    const end = parseKnowledge(diff.endVersion);
    if (covers(baseKnowledge, end)) continue;

    const device = diff.shortDeviceId;
    const startAt = parseKnowledge(diff.startVersion).get(device) ?? 0;
    // Changes between what is known and where this diff starts are missing,
    // so the merge would silently lose them
    if (startAt > (known.get(device) ?? 0)) {
      throw new Error(
        `Missing diffs on device ${device}: a diff starts at ${device}-${startAt} but only ${device}-${known.get(device) ?? 0} is known`
      );
    }

    const isNew = (e: Entity) => !knows(baseKnowledge, e.entityVersion);
    for (const item of diff.items ?? []) {
      const type = item.entityType ?? "";
      let applied: Entity[] = [];
      if (type === "budgetMetaData") {
        if (isNew(item)) {
          budgetMetaData = item as unknown as YfullFile["budgetMetaData"];
          applied = [item];
        }
      } else if (TOP_LEVEL[type] || CHILD_BY_TYPE.has(type)) {
        applied = put(type, item, undefined, isNew);
      } else {
        if (isNew(item)) unknown.add(type);
        continue;
      }
      stats.itemsApplied += applied.length;
      stats.tombstonesApplied += applied.filter((e) => e.isTombstone).length;
    }

    for (const [d, n] of end) known.set(d, Math.max(known.get(d) ?? 0, n));
    stats.diffsApplied++;
  }

  // Rebuild the nested yfull shape
  const parentIdOf = (child: (typeof CHILDREN)[number], e: Entity) =>
    child.parentKeys.map((k) => e[k]).find((v): v is string => typeof v === "string" && v.length > 0);

  const childrenOf = new Map<string, Map<string, Entity[]>>(); // parentType:parentId -> arrayKey -> children
  for (const child of CHILDREN) {
    for (const e of store.get(child.type)?.values() ?? []) {
      const parentId = parentIdOf(child, e);
      if (!parentId || !store.get(child.parentType)?.has(parentId)) {
        stats.orphansDropped++;
        continue;
      }
      const key = `${child.parentType}:${parentId}`;
      let byArray = childrenOf.get(key);
      if (!byArray) childrenOf.set(key, (byArray = new Map()));
      const list = byArray.get(child.arrayKey) ?? [];
      list.push(e);
      byArray.set(child.arrayKey, list);
    }
  }

  const data = {
    ...base,
    budgetMetaData,
    fileMetaData: { ...base.fileMetaData, currentKnowledge: formatKnowledge(known) },
  } as YfullFile;
  for (const [type, key] of Object.entries(TOP_LEVEL)) {
    const arrays = CHILD_ARRAYS.get(type) ?? [];
    (data as unknown as Record<string, Entity[]>)[key] = [...(store.get(type)?.values() ?? [])].map((e) => {
      const byArray = childrenOf.get(`${type}:${e.entityId}`);
      const out: Entity = { ...e };
      for (const { arrayKey } of arrays) out[arrayKey] = byArray?.get(arrayKey) ?? [];
      return out;
    });
  }

  stats.unknownTypes = [...unknown].sort();
  return { data, stats };
}

// ─── Package I/O ──────────────────────────────────────────────────────────────

interface Ydevice {
  shortDeviceId: string;
  deviceGUID: string;
  knowledge?: string | null;
  knowledgeInFullBudgetFile?: string | null;
}

export interface PackageSummary extends MergeStats {
  source: string;
  baseDevice: string | null;
  baseKnowledge: string;
  knowledge: string;
}

async function readJson<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    throw new Error(`Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Reads a `.ynab4` package directory and merges its snapshot and diffs. */
export async function readYnab4Package(dir: string): Promise<{ data: YfullFile; summary: PackageSummary }> {
  const meta = await readJson<{ relativeDataFolderName?: string }>(path.join(dir, "Budget.ymeta"));
  if (!meta.relativeDataFolderName) throw new Error(`${dir}/Budget.ymeta has no relativeDataFolderName`);
  const dataDir = path.join(dir, meta.relativeDataFolderName);

  const deviceFiles = (await readdir(path.join(dataDir, "devices"))).filter((f) => f.endsWith(".ydevice"));
  const devices = await Promise.all(
    deviceFiles.map((f) => readJson<Ydevice>(path.join(dataDir, "devices", f)))
  );

  // The snapshot with the most knowledge is the base
  let best: { device: Ydevice; file: string; knowledge: Knowledge } | null = null;
  for (const device of devices) {
    if (!device.knowledgeInFullBudgetFile) continue;
    const file = path.join(dataDir, device.deviceGUID, "Budget.yfull");
    if (!(await exists(file))) continue;
    const knowledge = parseKnowledge(device.knowledgeInFullBudgetFile);
    if (!best || total(knowledge) > total(best.knowledge)) best = { device, file, knowledge };
  }
  if (!best) throw new Error(`No Budget.yfull snapshot found in ${dataDir}`);

  const base = await readJson<YfullFile>(best.file);
  // The snapshot's own record of what it holds outranks the device file's
  const baseKnowledge = parseKnowledge(base.fileMetaData?.currentKnowledge || best.device.knowledgeInFullBudgetFile);

  const diffFiles: string[] = [];
  for (const entry of await readdir(dataDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "devices") continue;
    for (const f of await readdir(path.join(dataDir, entry.name))) {
      if (f.endsWith(".ydiff")) diffFiles.push(path.join(dataDir, entry.name, f));
    }
  }
  const diffs = await Promise.all(diffFiles.map((f) => readJson<YdiffFile>(f)));

  const { data, stats } = applyDiffs(base, diffs, baseKnowledge);
  return {
    data,
    summary: {
      ...stats,
      source: dir,
      baseDevice: best.device.shortDeviceId,
      baseKnowledge: formatKnowledge(baseKnowledge),
      knowledge: data.fileMetaData.currentKnowledge,
    },
  };
}

/**
 * The sub-transactions to delete so each split matches YNAB. YNAB 4 drops a
 * removed sub-transaction from its parent rather than tombstoning it, so any
 * row under a transaction YNAB holds that YNAB no longer lists is stale; a
 * parent that is no longer a split keeps none. Transactions YNAB does not hold
 * are left alone.
 */
export function staleSubTransactionIds(
  existing: { id: number; transactionId: number; ynabId: string }[],
  current: Map<number, Set<string>>
): number[] {
  return existing
    .filter((row) => {
      const live = current.get(row.transactionId);
      return live !== undefined && !live.has(row.ynabId);
    })
    .map((row) => row.id);
}

/** Loads a budget from either a `.ynab4` package or a flat `.yfull` file. */
export async function loadBudget(source: string): Promise<{ data: YfullFile; summary: PackageSummary }> {
  if (source.endsWith(".yfull")) {
    const data = await readJson<YfullFile>(source);
    const knowledge = data.fileMetaData?.currentKnowledge ?? "";
    return {
      data,
      summary: {
        source,
        baseDevice: null,
        baseKnowledge: knowledge,
        knowledge,
        diffsTotal: 0,
        diffsApplied: 0,
        itemsApplied: 0,
        tombstonesApplied: 0,
        orphansDropped: 0,
        unknownTypes: [],
        warnings: [],
      },
    };
  }
  return readYnab4Package(source);
}

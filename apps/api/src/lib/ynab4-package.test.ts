import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applyDiffs,
  covers,
  formatKnowledge,
  knows,
  loadBudget,
  parseKnowledge,
  readYnab4Package,
  staleSubTransactionIds,
  type YdiffFile,
  type YfullFile,
} from "./ynab4-package";

/** A small snapshot: one account, one group with one category, one month, one split. */
const base = (knowledge = "A-10"): YfullFile =>
  ({
    fileMetaData: { budgetDataVersion: "4.2", currentKnowledge: knowledge },
    budgetMetaData: { currencyLocale: "en_US", budgetType: "Personal" },
    accounts: [{ entityType: "account", entityId: "acc1", entityVersion: "A-1", accountName: "Checking" }],
    payees: [
      {
        entityType: "payee",
        entityId: "p1",
        entityVersion: "A-2",
        name: "Shop",
        renameConditions: [
          { entityType: "payeeStringCondition", entityId: "rc1", entityVersion: "A-3", parentPayeeId: "p1", operator: "Is", operand: "SHOP" },
        ],
      },
    ],
    masterCategories: [
      {
        entityType: "masterCategory",
        entityId: "mc1",
        entityVersion: "A-4",
        name: "Bills",
        subCategories: [
          { entityType: "category", entityId: "c1", entityVersion: "A-5", name: "Rent", masterCategoryId: "mc1" },
        ],
      },
    ],
    monthlyBudgets: [
      {
        entityType: "monthlyBudget",
        entityId: "MB/2025-01",
        entityVersion: "A-6",
        month: "2025-01-01",
        monthlySubCategoryBudgets: [
          { entityType: "monthlyCategoryBudget", entityId: "MCB/2025-01/c1", entityVersion: "A-7", categoryId: "c1", budgeted: 100, parentMonthlyBudgetId: "MB/2025-01" },
        ],
      },
    ],
    transactions: [
      {
        entityType: "transaction",
        entityId: "t1",
        entityVersion: "A-8",
        accountId: "acc1",
        amount: -50,
        date: "2025-01-05",
        categoryId: "Category/__Split__",
        subTransactions: [
          { entityType: "subTransaction", entityId: "s1", entityVersion: "A-9", parentTransactionId: "t1", amount: -50, categoryId: "c1" },
        ],
      },
    ],
    scheduledTransactions: [],
  }) as unknown as YfullFile;

const diff = (start: string, end: string, items: Record<string, unknown>[], device = "B"): YdiffFile =>
  ({ shortDeviceId: device, startVersion: start, endVersion: end, items }) as YdiffFile;

describe("knowledge", () => {
  test("parses and formats a version vector", () => {
    const k = parseKnowledge("B-83,A-5459,H-15136");
    expect(k.get("A")).toBe(5459);
    expect(k.get("H")).toBe(15136);
    expect(formatKnowledge(k)).toBe("A-5459,B-83,H-15136");
    expect(parseKnowledge(null).size).toBe(0);
  });

  test("knows a version at or below the device counter only", () => {
    const k = parseKnowledge("A-10,B-3");
    expect(knows(k, "A-10")).toBe(true);
    expect(knows(k, "A-11")).toBe(false);
    expect(knows(k, "C-1")).toBe(false);
    expect(knows(k, undefined)).toBe(false);
  });

  test("covers compares every device", () => {
    expect(covers(parseKnowledge("A-10,B-3"), parseKnowledge("A-9,B-3"))).toBe(true);
    expect(covers(parseKnowledge("A-10,B-3"), parseKnowledge("A-9,B-4"))).toBe(false);
  });
});

describe("applyDiffs", () => {
  test("with no diffs returns the snapshot unchanged in shape", () => {
    const { data, stats } = applyDiffs(base(), []);
    expect(stats.diffsApplied).toBe(0);
    expect(data.transactions[0]!.subTransactions!.map((s) => s.entityId)).toEqual(["s1"]);
    expect(data.payees[0]!.renameConditions!.map((c) => c.entityId)).toEqual(["rc1"]);
    expect(data.masterCategories[0]!.subCategories!.map((c) => c.entityId)).toEqual(["c1"]);
    expect(data.monthlyBudgets[0]!.monthlySubCategoryBudgets.map((m) => m.budgeted)).toEqual([100]);
  });

  test("skips diffs the snapshot already holds", () => {
    const { data, stats } = applyDiffs(base("A-10,B-5"), [
      diff("A-10,B-4", "A-10,B-5", [{ entityType: "account", entityId: "acc1", entityVersion: "B-5", accountName: "Stale" }]),
    ]);
    expect(stats.diffsApplied).toBe(0);
    expect(data.accounts[0]!.accountName).toBe("Checking");
  });

  test("applies new and changed entities, keeping nested children", () => {
    const { data, stats } = applyDiffs(base(), [
      diff("A-10", "A-10,B-3", [
        { entityType: "transaction", entityId: "t1", entityVersion: "B-1", accountId: "acc1", amount: -60, date: "2025-01-06", subTransactions: [] },
        { entityType: "transaction", entityId: "t2", entityVersion: "B-2", accountId: "acc1", amount: 10, date: "2025-02-01", subTransactions: null },
        { entityType: "payee", entityId: "p1", entityVersion: "B-3", name: "Shop Renamed" },
      ]),
    ]);
    expect(stats.diffsApplied).toBe(1);
    expect(stats.itemsApplied).toBe(3);
    expect(data.transactions.map((t) => [t.entityId, t.amount])).toEqual([["t1", -60], ["t2", 10]]);
    // The diff's empty array leaves the split's existing children alone
    expect(data.transactions[0]!.subTransactions!.map((s) => s.entityId)).toEqual(["s1"]);
    expect(data.transactions[1]!.subTransactions).toEqual([]);
    expect(data.payees[0]!.name).toBe("Shop Renamed");
    expect(data.payees[0]!.renameConditions!.map((c) => c.entityId)).toEqual(["rc1"]);
    expect(data.fileMetaData.currentKnowledge).toBe("A-10,B-3");
  });

  test("routes standalone child items to their parents", () => {
    const { data } = applyDiffs(base(), [
      diff("A-10", "A-10,B-4", [
        { entityType: "monthlyBudget", entityId: "MB/2025-02", entityVersion: "B-1", month: "2025-02-01" },
        { entityType: "monthlyCategoryBudget", entityId: "MCB/2025-02/c1", entityVersion: "B-2", categoryId: "c1", budgeted: 75, parentMonthlyBudgetId: "MB/2025-02" },
        { entityType: "monthlyCategoryBudget", entityId: "MCB/2025-01/c1", entityVersion: "B-3", categoryId: "c1", budgeted: 120, parentMonthlyBudgetId: "MB/2025-01" },
        { entityType: "category", entityId: "c2", entityVersion: "B-4", name: "Power", masterCategoryId: "mc1" },
      ]),
    ]);
    expect(data.monthlyBudgets.map((mb) => [mb.month, mb.monthlySubCategoryBudgets.map((s) => s.budgeted)])).toEqual([
      ["2025-01-01", [120]],
      ["2025-02-01", [75]],
    ]);
    expect(data.masterCategories[0]!.subCategories!.map((c) => c.name)).toEqual(["Rent", "Power"]);
  });

  test("keeps tombstones so they can be applied", () => {
    const { data, stats } = applyDiffs(base(), [
      diff("A-10", "A-10,B-2", [
        { entityType: "transaction", entityId: "t1", entityVersion: "B-1", accountId: "acc1", amount: -50, date: "2025-01-05", isTombstone: true },
        { entityType: "subTransaction", entityId: "s1", entityVersion: "B-2", parentTransactionId: "t1", amount: -50, isTombstone: true },
      ]),
    ]);
    expect(stats.tombstonesApplied).toBe(2);
    expect(data.transactions[0]!.isTombstone).toBe(true);
    expect(data.transactions[0]!.subTransactions![0]!.isTombstone).toBe(true);
  });

  test("applies diffs in causal order whatever order they arrive in", () => {
    const { data } = applyDiffs(base(), [
      diff("A-10,B-1", "A-10,B-2", [{ entityType: "account", entityId: "acc1", entityVersion: "B-2", accountName: "Second" }]),
      diff("A-10", "A-10,B-1", [{ entityType: "account", entityId: "acc1", entityVersion: "B-1", accountName: "First" }]),
    ]);
    expect(data.accounts[0]!.accountName).toBe("Second");
  });

  test("only applies the items of a diff the snapshot does not hold", () => {
    // Device B's snapshot holds B-1, so of a diff spanning B-1..B-2 only B-2 is new
    const { data } = applyDiffs(base("A-10,B-1"), [
      diff("A-10,B-0", "A-10,B-2", [
        { entityType: "account", entityId: "acc1", entityVersion: "B-1", accountName: "Old" },
        { entityType: "payee", entityId: "p1", entityVersion: "B-2", name: "New" },
      ]),
    ]);
    expect(data.accounts[0]!.accountName).toBe("Checking");
    expect(data.payees[0]!.name).toBe("New");
  });

  test("refuses a device whose diffs have a gap", () => {
    expect(() =>
      applyDiffs(base(), [
        diff("A-10", "A-10,B-1", [{ entityType: "account", entityId: "acc1", entityVersion: "B-1", accountName: "First" }]),
        diff("A-10,B-5", "A-10,B-6", [{ entityType: "account", entityId: "acc1", entityVersion: "B-6", accountName: "Later" }]),
      ])
    ).toThrow(/Missing diffs on device B/);
  });

  test("drops orphans and reports unknown entity types", () => {
    const { stats } = applyDiffs(base(), [
      diff("A-10", "A-10,B-1", [
        { entityType: "subTransaction", entityId: "sx", entityVersion: "B-1", parentTransactionId: "missing", amount: 1 },
        { entityType: "somethingNew", entityId: "z", entityVersion: "B-1" },
      ]),
    ]);
    expect(stats.orphansDropped).toBe(1);
    expect(stats.unknownTypes).toEqual(["somethingNew"]);
  });

  test("checks each child nested in a diff item against the snapshot", () => {
    // The snapshot holds B-1, so of the split's children only the B-2 one is new
    const { data, stats } = applyDiffs(base("A-10,B-1"), [
      diff("A-10,B-0", "A-10,B-2", [
        {
          entityType: "transaction",
          entityId: "t1",
          entityVersion: "B-2",
          accountId: "acc1",
          amount: -50,
          date: "2025-01-05",
          categoryId: "Category/__Split__",
          subTransactions: [
            { entityType: "subTransaction", entityId: "s1", entityVersion: "B-1", parentTransactionId: "t1", amount: -999 },
            { entityType: "subTransaction", entityId: "s2", entityVersion: "B-2", parentTransactionId: "t1", amount: -5 },
          ],
        },
      ]),
    ]);
    expect(data.transactions[0]!.subTransactions!.map((s) => [s.entityId, s.amount])).toEqual([
      ["s1", -50],
      ["s2", -5],
    ]);
    expect(stats.itemsApplied).toBe(2);
  });

  test("applies the new children of a parent the snapshot already holds", () => {
    const { data } = applyDiffs(base("A-10,B-1"), [
      diff("A-10,B-0", "A-10,B-2", [
        {
          entityType: "transaction",
          entityId: "t1",
          entityVersion: "B-1",
          accountId: "acc1",
          amount: -1,
          date: "2025-01-05",
          subTransactions: [{ entityType: "subTransaction", entityId: "s1", entityVersion: "B-2", parentTransactionId: "t1", amount: -7 }],
        },
      ]),
    ]);
    expect(data.transactions[0]!.amount).toBe(-50);
    expect(data.transactions[0]!.subTransactions![0]!.amount).toBe(-7);
  });

  test("applies an item that carries no version", () => {
    const { data } = applyDiffs(base("A-10,B-1"), [
      diff("A-10,B-0", "A-10,B-2", [{ entityType: "account", entityId: "acc1", accountName: "Unversioned" }]),
    ]);
    expect(data.accounts[0]!.accountName).toBe("Unversioned");
  });
});

describe("staleSubTransactionIds", () => {
  const rows = [
    { id: 1, transactionId: 10, ynabId: "s1" },
    { id: 2, transactionId: 10, ynabId: "s2" },
    { id: 3, transactionId: 20, ynabId: "s3" },
    { id: 4, transactionId: 30, ynabId: "s4" },
  ];

  test("deletes rows YNAB no longer lists under a transaction it holds", () => {
    const current = new Map([
      [10, new Set(["s1"])],
      [20, new Set<string>()],
    ]);
    // 10 lost s2, 20 is no longer a split, 30 is not a YNAB transaction
    expect(staleSubTransactionIds(rows, current)).toEqual([2, 3]);
  });

  test("keeps everything when YNAB still lists it", () => {
    const current = new Map([
      [10, new Set(["s1", "s2"])],
      [20, new Set(["s3"])],
    ]);
    expect(staleSubTransactionIds(rows, current)).toEqual([]);
  });
});

describe("readYnab4Package", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true });
  });

  /** Lays out a package: device A with an old snapshot, device B with a newer one and diffs. */
  async function makePackage() {
    const root = await mkdtemp(path.join(tmpdir(), "ynab4-"));
    dirs.push(root);
    const pkg = path.join(root, "Test~ABC.ynab4");
    const data = path.join(pkg, "data1~X");
    await mkdir(path.join(data, "devices"), { recursive: true });
    await mkdir(path.join(data, "GUID-A"));
    await mkdir(path.join(data, "GUID-B"));
    await writeFile(path.join(pkg, "Budget.ymeta"), JSON.stringify({ relativeDataFolderName: "data1~X" }));

    const write = (file: string, body: unknown) => writeFile(path.join(data, file), JSON.stringify(body));
    await write("devices/A.ydevice", { shortDeviceId: "A", deviceGUID: "GUID-A", knowledgeInFullBudgetFile: "A-10" });
    await write("devices/B.ydevice", { shortDeviceId: "B", deviceGUID: "GUID-B", knowledgeInFullBudgetFile: "A-10,B-1" });
    await write("devices/C.ydevice", { shortDeviceId: "C", deviceGUID: "GUID-C", knowledgeInFullBudgetFile: null });

    const old = base("A-10");
    old.accounts[0]!.accountName = "From A";
    await write("GUID-A/Budget.yfull", old);
    const newer = base("A-10,B-1");
    newer.accounts[0]!.accountName = "From B";
    await write("GUID-B/Budget.yfull", newer);

    await write("GUID-B/A-10,B-0_B-1.ydiff", diff("A-10,B-0", "A-10,B-1", [
      { entityType: "account", entityId: "acc1", entityVersion: "B-1", accountName: "From B" },
    ]));
    await write("GUID-B/A-10,B-1_B-2.ydiff", diff("A-10,B-1", "A-10,B-2", [
      { entityType: "transaction", entityId: "t9", entityVersion: "B-2", accountId: "acc1", amount: 5, date: "2025-03-01" },
    ]));
    return pkg;
  }

  test("takes the freshest snapshot and applies the diffs beyond it", async () => {
    const { data, summary } = await readYnab4Package(await makePackage());
    expect(summary.baseDevice).toBe("B");
    expect(summary.diffsTotal).toBe(2);
    expect(summary.diffsApplied).toBe(1);
    expect(summary.knowledge).toBe("A-10,B-2");
    expect(data.accounts[0]!.accountName).toBe("From B");
    expect(data.transactions.map((t) => t.entityId)).toEqual(["t1", "t9"]);
  });

  test("loadBudget reads a flat yfull as it is", async () => {
    const pkg = await makePackage();
    const file = path.join(pkg, "data1~X", "GUID-A", "Budget.yfull");
    const { data, summary } = await loadBudget(file);
    expect(data.accounts[0]!.accountName).toBe("From A");
    expect(summary.diffsApplied).toBe(0);
  });

  test("fails clearly on a package with no snapshot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ynab4-"));
    dirs.push(root);
    await mkdir(path.join(root, "d", "devices"), { recursive: true });
    await writeFile(path.join(root, "Budget.ymeta"), JSON.stringify({ relativeDataFolderName: "d" }));
    await expect(readYnab4Package(root)).rejects.toThrow(/No Budget.yfull/);
  });
});

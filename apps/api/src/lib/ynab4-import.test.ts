import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  accountRows,
  categoryGroupRows,
  categoryResolver,
  categoryRows,
  groupRanks,
  type ImportContext,
  importTargets,
  mirrorRequested,
  monthlyBudgetRows,
  renameRuleRows,
  type RowRefs,
  scheduledTransactionRows,
  SYSTEM_GROUP_RANK,
  subTransactionRows,
  toMoney,
  transactionRows,
} from "./ynab4-import";
import type { YfullFile } from "./ynab4-package";

const now = new Date("2025-06-01T00:00:00Z");
const plain: ImportContext = { budgetId: 7, mirror: false, now };
const mirror: ImportContext = { ...plain, mirror: true };

/** Only the parts of a snapshot a test names; the rest are empty. */
const data = (parts: Partial<Record<keyof YfullFile, unknown>>): YfullFile =>
  ({
    accounts: [],
    payees: [],
    masterCategories: [],
    monthlyBudgets: [],
    transactions: [],
    scheduledTransactions: [],
    ...parts,
  }) as unknown as YfullFile;

const refs: RowRefs = {
  accounts: new Map([["acc1", 11], ["acc2", 12]]),
  payees: new Map([["p1", 21]]),
  resolveCategory: categoryResolver(new Map([["c1", 31]])),
};

describe("toMoney", () => {
  test("formats to two places and never yields -0.00", () => {
    expect(toMoney(12.5)).toBe("12.50");
    expect(toMoney(-0.001)).toBe("0.00");
    expect(toMoney(null)).toBe("0.00");
    expect(toMoney(undefined)).toBe("0.00");
  });
});

describe("sort order", () => {
  test("accounts rank densely by sortableIndex", () => {
    const rows = accountRows(
      data({
        accounts: [
          { entityId: "b", sortableIndex: 2_000_000_000, accountType: "Savings", lastEnteredCheckNumber: -1 },
          { entityId: "a", sortableIndex: -2_000_000_000, accountType: "Checking", lastEnteredCheckNumber: 101 },
        ],
      }),
      plain
    );
    expect(rows.map((r) => [r.ynabId, r.sortOrder])).toEqual([["b", 1], ["a", 0]]);
    expect(rows.map((r) => r.lastEnteredCheckNum)).toEqual([null, 101]);
  });

  test("system groups rank after every user group", () => {
    const ranks = groupRanks([
      { entityId: "MasterCategory/__Hidden__", sortableIndex: 0 },
      { entityId: "mcA", sortableIndex: 5 },
      { entityId: "MasterCategory/__Internal__", sortableIndex: 7 },
      { entityId: "mcB", sortableIndex: 9 },
    ] as YfullFile["masterCategories"]);
    expect(Object.fromEntries(ranks)).toEqual({
      "MasterCategory/__Hidden__": SYSTEM_GROUP_RANK,
      mcA: 0,
      "MasterCategory/__Internal__": SYSTEM_GROUP_RANK + 1,
      mcB: 1,
    });
  });

  test("categories rank within their group and skip a group that did not import", () => {
    const d = data({
      masterCategories: [
        {
          entityId: "mc1",
          sortableIndex: 0,
          subCategories: [
            { entityId: "c2", sortableIndex: 50, name: "Two" },
            { entityId: "c1", sortableIndex: 10, name: "One" },
          ],
        },
        { entityId: "mcGone", sortableIndex: 1, subCategories: [{ entityId: "c3", sortableIndex: 0 }] },
      ],
    });
    const rows = categoryRows(d, plain, new Map([["mc1", 99]]));
    expect(rows.map((r) => [r.ynabId, r.groupId, r.sortOrder, r.type])).toEqual([
      ["c2", 99, 1, "OUTFLOW"],
      ["c1", 99, 0, "OUTFLOW"],
    ]);
    const groups = categoryGroupRows(d, plain);
    expect(groups.map((g) => [g.ynabId, g.isSystem])).toEqual([["mc1", false], ["mcGone", false]]);
  });
});

describe("mirror only fields", () => {
  const d = data({
    accounts: [{ entityId: "acc1", sortableIndex: 0, lastEnteredCheckNumber: -1, note: "hi" }],
    transactions: [
      { entityId: "t1", accountId: "acc1", amount: -5, date: "2025-01-01", flag: "Red" },
      { entityId: "t2", accountId: "acc1", amount: -5, date: "2025-01-01", flag: "Teal" },
      { entityId: "t3", accountId: "accMissing", amount: -5, date: "2025-01-01" },
    ],
    scheduledTransactions: [
      { entityId: "s1", accountId: "acc1", amount: -1, date: "2025-01-15", frequency: "TwiceAMonth", twiceAMonthStartDay: 0 },
      { entityId: "s2", accountId: "acc1", amount: -1, date: "2025-01-15", frequency: "Monthly", twiceAMonthStartDay: 15 },
    ],
  });

  test("a plain import leaves note, flag and pinned day to znab", () => {
    expect("note" in accountRows(d, plain)[0]!).toBe(false);
    const txns = transactionRows(d, plain, refs);
    expect(txns.map((t) => t.ynabId)).toEqual(["t1", "t2"]);
    expect(txns.some((t) => "flagColor" in t)).toBe(false);
    expect(scheduledTransactionRows(d, plain, refs).some((s) => "anchorDay" in s)).toBe(false);
  });

  test("a mirror takes them from YNAB, dropping a flag outside the vocabulary", () => {
    expect(accountRows(d, mirror)[0]!.note).toBe("hi");
    expect(transactionRows(d, mirror, refs).map((t) => t.flagColor)).toEqual(["Red", null]);
    const sched = scheduledTransactionRows(d, mirror, refs);
    expect(sched.map((s) => s.anchorDay)).toEqual([null, null]);
    // A 0 start day means none, and only TwiceAMonth carries one at all
    expect(sched.map((s) => s.twiceMonthDay)).toEqual([null, null]);
  });
});

describe("transactions", () => {
  test("special categories carry no category id but keep their YNAB id", () => {
    const [income, split] = transactionRows(
      data({
        transactions: [
          { entityId: "t1", accountId: "acc1", amount: 100, date: "2025-01-01", categoryId: "Category/__ImmediateIncome__", payeeId: "p1" },
          { entityId: "t2", accountId: "acc1", amount: -5, date: "2025-01-02", categoryId: "Category/__Split__", isTombstone: true },
        ],
      }),
      plain,
      refs
    );
    expect(income).toMatchObject({ categoryId: null, categoryYnabId: "Category/__ImmediateIncome__", payeeId: 21, cleared: "Uncleared", isSplit: false, deletedAt: null });
    expect(split).toMatchObject({ isSplit: true, deletedAt: now });
  });

  test("split parts are kept per parent, and a non split parent keeps none", () => {
    const { rows, live } = subTransactionRows(
      data({
        transactions: [
          {
            entityId: "t1",
            categoryId: "Category/__Split__",
            subTransactions: [
              { entityId: "s1", amount: -3, categoryId: "c1" },
              { entityId: "s2", amount: -2, isTombstone: true },
            ],
          },
          { entityId: "t2", categoryId: "c1", subTransactions: [{ entityId: "s3", amount: -1 }] },
          { entityId: "tUnknown", categoryId: "Category/__Split__", subTransactions: [{ entityId: "s4", amount: -1 }] },
        ],
      }),
      new Map([["t1", 1], ["t2", 2]]),
      refs
    );
    expect(rows).toEqual([
      { ynabId: "s1", transactionId: 1, categoryId: 31, categoryYnabId: "c1", payeeId: null, amount: "-3.00", memo: null },
    ]);
    expect([...live].map(([id, set]) => [id, [...set]])).toEqual([[1, ["s1"]], [2, []]]);
  });
});

describe("rename rules and monthly budgets", () => {
  test("inert rules are dropped and unknown operators are reported", () => {
    const { rows, skipped } = renameRuleRows(
      data({
        payees: [
          {
            entityId: "p1",
            renameConditions: [
              { entityId: "r1", parentPayeeId: "p1", operator: "Is", operand: "SHOP" },
              { entityId: "r2", parentPayeeId: "p1", operator: "Is", operand: "  " },
              { entityId: "r3", parentPayeeId: "pGone", operator: "Is", operand: "X" },
              { entityId: "r4", parentPayeeId: "p1", operator: "Regex", operand: "X" },
            ],
          },
        ],
      }),
      plain,
      refs.payees
    );
    expect(rows.map((r) => r.ynabId)).toEqual(["r1"]);
    expect(skipped.map((c) => c.entityId)).toEqual(["r4"]);
  });

  test("one row per category and month, the live entry winning", () => {
    const rows = monthlyBudgetRows(
      data({
        monthlyBudgets: [
          {
            month: "2025-01-01",
            monthlySubCategoryBudgets: [
              { entityId: "live", categoryId: "c1", budgeted: 10 },
              { entityId: "dead", categoryId: "c1", budgeted: 20, isTombstone: true },
              { entityId: "unknown", categoryId: "cGone", budgeted: 5, overspendingHandling: "Confined" },
            ],
          },
        ],
      }),
      plain,
      refs.resolveCategory
    );
    expect(rows.map((r) => [r.ynabId, r.categoryId, r.budgeted, r.overspendingHandling])).toEqual([
      ["unknown", null, "5.00", "Confined"],
      ["live", 31, "10.00", null],
    ]);
  });
});

describe("importTargets", () => {
  const users = { zach: 1, demo: 2 };
  const root = "/repo";

  test("defaults to the packages under seed-data, Demo included", () => {
    const targets = importTargets({}, users, root);
    expect(targets.map((t) => [t.label, t.ynabId, t.userId, t.overwrite])).toEqual([
      ["Zach", "zach-main", 1, true],
      ["Fiona", "fiona-main", 1, true],
      ["Demo", "demo-main", 2, false],
    ]);
    expect(targets[0]!.source).toBe(path.join(root, "seed-data", "Zach_s Budget~85D0690E.ynab4"));
    expect(targets[2]!.source).toBe(path.join(root, "seed-data", "Demo.yfull"));
  });

  test("honours the variables scripts/sync-ynab4.sh sets", () => {
    const env = {
      YNAB_SKIP_DEMO: "1",
      YNAB_MIRROR: "1",
      YNAB_ZACH_PACKAGE: "/sync/Zach.ynab4",
      YNAB_FIONA_PACKAGE: "relative/Fiona.ynab4",
    };
    const targets = importTargets(env, users, root);
    expect(targets.map((t) => [t.label, t.source])).toEqual([
      ["Zach", "/sync/Zach.ynab4"],
      ["Fiona", path.join(root, "relative/Fiona.ynab4")],
    ]);
    expect(mirrorRequested(env)).toBe(true);
    expect(mirrorRequested({})).toBe(false);
  });
});

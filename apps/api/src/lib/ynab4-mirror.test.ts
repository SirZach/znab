import { describe, expect, test } from "bun:test";
import { assertMirrorable, knownYnabIds, planMirrorDeletes, type MirrorRows } from "./ynab4-mirror";
import type { YfullFile } from "./ynab4-package";

const data = (over: Partial<YfullFile> = {}): YfullFile =>
  ({
    accounts: [{ entityId: "acc1" }, { entityId: "acc2", isTombstone: true }],
    masterCategories: [{ entityId: "mc1", subCategories: [{ entityId: "cat1" }, { entityId: "cat2", isTombstone: true }] }, { entityId: "mc2" }],
    payees: [{ entityId: "p1", renameConditions: [{ entityId: "rc1" }] }, { entityId: "p2", renameConditions: null }],
    monthlyBudgets: [{ entityId: "MB/2024-01", monthlySubCategoryBudgets: [{ entityId: "MCB/2024-01/cat1" }] }],
    transactions: [{ entityId: "t1" }, { entityId: "t2", isTombstone: true }],
    scheduledTransactions: [{ entityId: "s1" }],
    ...over,
  }) as unknown as YfullFile;

describe("knownYnabIds", () => {
  test("collects every entity id, nested ones and tombstones included", () => {
    const known = knownYnabIds(data());
    expect([...known.accounts]).toEqual(["acc1", "acc2"]);
    expect([...known.categoryGroups]).toEqual(["mc1", "mc2"]);
    expect([...known.categories]).toEqual(["cat1", "cat2"]);
    expect([...known.payees]).toEqual(["p1", "p2"]);
    expect([...known.payeeRenameRules]).toEqual(["rc1"]);
    expect([...known.monthlyBudgets]).toEqual(["MCB/2024-01/cat1"]);
    expect([...known.transactions]).toEqual(["t1", "t2"]);
    expect([...known.scheduledTransactions]).toEqual(["s1"]);
  });
});

describe("planMirrorDeletes", () => {
  const known = knownYnabIds(data());
  const rows = (over: Partial<MirrorRows> = {}): MirrorRows => ({
    accounts: [{ id: 1, ynabId: "acc1" }, { id: 2, ynabId: "acc2" }],
    categoryGroups: [{ id: 1, ynabId: "mc1" }],
    categories: [{ id: 1, ynabId: "cat1", groupId: 1 }],
    payees: [{ id: 1, ynabId: "p1" }],
    payeeRenameRules: [{ id: 1, ynabId: "rc1", payeeId: 1 }],
    monthlyBudgets: [{ id: 1, ynabId: "MCB/2024-01/cat1", categoryId: 1 }],
    transactions: [{ id: 1, ynabId: "t1", accountId: 1 }, { id: 2, ynabId: "t2", accountId: 2 }],
    scheduledTransactions: [{ id: 1, ynabId: "s1", accountId: 1 }],
    ...over,
  });

  test("removes nothing from a budget that only holds YNAB's rows", () => {
    const plan = planMirrorDeletes(rows(), known);
    expect(Object.values(plan).flat()).toEqual([]);
  });

  test("removes the rows znab minted ids for", () => {
    const plan = planMirrorDeletes(
      rows({
        accounts: [{ id: 1, ynabId: "acc1" }, { id: 3, ynabId: "Account/abc" }],
        categoryGroups: [{ id: 1, ynabId: "mc1" }, { id: 2, ynabId: "MasterCategory/__PreYNABDebtMaster__" }],
        categories: [{ id: 1, ynabId: "cat1", groupId: 1 }, { id: 2, ynabId: "Category/xyz", groupId: 1 }],
        payees: [{ id: 1, ynabId: "p1" }, { id: 2, ynabId: "Payee/def" }],
        payeeRenameRules: [{ id: 1, ynabId: "rc1", payeeId: 1 }, { id: 2, ynabId: "PayeeStringCondition/ghi", payeeId: 1 }],
        monthlyBudgets: [{ id: 1, ynabId: "MCB/2024-01/cat1", categoryId: 1 }, { id: 2, ynabId: "MCB/2024-02/1", categoryId: 1 }],
        transactions: [{ id: 1, ynabId: "t1", accountId: 1 }, { id: 3, ynabId: "0d9c-uuid", accountId: 1 }],
        scheduledTransactions: [{ id: 1, ynabId: "s1", accountId: 1 }, { id: 2, ynabId: "1e2f-uuid", accountId: 1 }],
      }),
      known
    );
    expect(plan).toEqual({
      accounts: [3],
      categoryGroups: [2],
      categories: [2],
      payees: [2],
      payeeRenameRules: [2],
      monthlyBudgets: [2],
      transactions: [3],
      scheduledTransactions: [2],
    });
  });

  test("takes a known row along when the parent it cannot exist without is removed", () => {
    const plan = planMirrorDeletes(
      rows({
        accounts: [{ id: 1, ynabId: "acc1" }, { id: 9, ynabId: "Account/abc" }],
        categoryGroups: [{ id: 1, ynabId: "mc1" }, { id: 9, ynabId: "MasterCategory/new" }],
        categories: [{ id: 1, ynabId: "cat1", groupId: 9 }],
        payees: [{ id: 1, ynabId: "p1" }, { id: 9, ynabId: "Payee/new" }],
        payeeRenameRules: [{ id: 1, ynabId: "rc1", payeeId: 9 }],
        monthlyBudgets: [{ id: 1, ynabId: "MCB/2024-01/cat1", categoryId: 1 }, { id: 2, ynabId: "MCB/2024-01/cat1", categoryId: null }],
        transactions: [{ id: 1, ynabId: "t1", accountId: 9 }],
        scheduledTransactions: [{ id: 1, ynabId: "s1", accountId: 9 }],
      }),
      known
    );
    expect(plan.categories).toEqual([1]);
    expect(plan.monthlyBudgets).toEqual([1]);
    expect(plan.payeeRenameRules).toEqual([1]);
    expect(plan.transactions).toEqual([1]);
    expect(plan.scheduledTransactions).toEqual([1]);
  });
});

describe("assertMirrorable", () => {
  test("accepts data with a live account and a live transaction", () => {
    expect(() => assertMirrorable(data())).not.toThrow();
  });

  test("refuses data with no live accounts", () => {
    expect(() => assertMirrorable(data({ accounts: [] }))).toThrow(/no live accounts/);
    expect(() => assertMirrorable(data({ accounts: [{ entityId: "a", isTombstone: true }] as never }))).toThrow(/no live accounts/);
  });

  test("refuses data with no live transactions", () => {
    expect(() => assertMirrorable(data({ transactions: [] }))).toThrow(/no live transactions/);
    expect(() => assertMirrorable(data({ transactions: [{ entityId: "t", isTombstone: true }] as never }))).toThrow(
      /no live transactions/
    );
  });
});

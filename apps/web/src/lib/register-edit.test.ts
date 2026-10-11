import { describe, expect, test } from "bun:test";
import type { RegisterFields } from "./register-row";
import {
  buildTransactionCreate,
  buildTransactionUpdate,
  fieldsFrom,
  flagColorOf,
  isReconciled,
  locksFor,
  SPLIT_NOTE,
  TRANSFER_CATEGORY_NOTE,
  TRANSFER_PAYEE_NOTE,
  transferKeepsCategory,
} from "./register-edit";

const fields = (over: Partial<RegisterFields> = {}): RegisterFields => ({
  date: new Date("2026-10-01T00:00:00"),
  payeeId: 7,
  payeeName: "Grocer",
  categoryId: 100,
  memo: "",
  flagColor: null,
  outflow: "12.50",
  inflow: "",
  ...over,
});

const txn = { id: 1, cleared: "Uncleared", isSplit: false, isTransfer: false };

describe("isReconciled", () => {
  test("either side being reconciled counts", () => {
    expect(isReconciled({ cleared: "Reconciled" })).toBe(true);
    expect(isReconciled({ cleared: "Cleared", counterpartCleared: "Reconciled" })).toBe(true);
    expect(isReconciled({ cleared: "Cleared", counterpartCleared: null })).toBe(false);
  });
});

describe("flagColorOf", () => {
  test("keeps a known colour and drops anything else", () => {
    expect(flagColorOf("Red")).toBe("Red");
    expect(flagColorOf("Teal")).toBeNull();
    expect(flagColorOf(null)).toBeNull();
  });
});

describe("fieldsFrom", () => {
  test("seeds the editor from a stored row at local midnight", () => {
    const seeded = fieldsFrom({
      date: "2026-10-01",
      payeeId: 7,
      payee: { name: "Grocer" },
      categoryId: 100,
      memo: null,
      flagColor: "Blue",
      amount: "-12.50",
    });
    expect(seeded.date?.getDate()).toBe(1);
    expect(seeded).toMatchObject({
      payeeName: "Grocer",
      memo: "",
      flagColor: "Blue",
      outflow: "12.50",
      inflow: "",
    });
  });
});

describe("transferKeepsCategory", () => {
  const accounts = [
    { id: 1, onBudget: true },
    { id: 2, onBudget: true },
    { id: 3, onBudget: false },
  ];
  test("a non-transfer always does", () => {
    expect(transferKeepsCategory(undefined, undefined, null)).toBe(true);
  });
  test("only the on-budget side of an on/off budget pair does", () => {
    expect(transferKeepsCategory(accounts[0], accounts, 3)).toBe(true);
    expect(transferKeepsCategory(accounts[0], accounts, 2)).toBe(false);
  });
});

describe("locksFor", () => {
  const keeps = (id: number | null) => id === null;
  test("a transfer locks its payee, and its category when it carries none", () => {
    expect(locksFor({ isTransfer: true, transferAccountId: 2 }, keeps)).toEqual({
      payee: TRANSFER_PAYEE_NOTE,
      category: { label: "No category", reason: TRANSFER_CATEGORY_NOTE },
    });
  });
  test("a split locks category and amount", () => {
    expect(locksFor({ isSplit: true, transferAccountId: null }, keeps)).toEqual({
      category: { label: "Split", reason: SPLIT_NOTE },
      amount: SPLIT_NOTE,
    });
  });
  test("an ordinary row locks nothing", () => {
    expect(locksFor({ transferAccountId: null }, keeps)).toEqual({});
  });
});

describe("buildTransactionCreate", () => {
  const ids = { budgetId: 1, accountId: 10 };
  test("refuses a zero or unreadable amount", () => {
    expect(buildTransactionCreate(ids, fields({ outflow: "" }))).toBeNull();
    expect(buildTransactionCreate(ids, fields({ inflow: "5" }))).toBeNull();
  });
  test("sends a named payee only when none was picked, and drops an empty memo", () => {
    const input = buildTransactionCreate(ids, fields({ payeeId: null, payeeName: "New" }));
    expect(input).toMatchObject({
      budgetId: 1,
      accountId: 10,
      payeeId: null,
      payeeName: "New",
      amount: -12.5,
      date: "2026-10-01",
      memo: undefined,
      cleared: "Uncleared",
      accepted: true,
    });
  });
});

describe("buildTransactionUpdate", () => {
  test("allows zero and keeps an empty memo", () => {
    const input = buildTransactionUpdate(txn, fields({ outflow: "" }), true);
    expect(input).toMatchObject({ id: 1, amount: 0, memo: "", categoryId: 100, payeeId: 7 });
    expect(input?.acknowledgeReconciled).toBe(false);
  });
  test("a transfer sends no payee, and no category where it carries none", () => {
    const input = buildTransactionUpdate({ ...txn, isTransfer: true }, fields(), false)!;
    expect("payeeId" in input).toBe(false);
    expect("payeeName" in input).toBe(false);
    expect("categoryId" in input).toBe(false);
  });
  test("a split sends no category", () => {
    const input = buildTransactionUpdate({ ...txn, isSplit: true }, fields(), true)!;
    expect("categoryId" in input).toBe(false);
  });
  test("a reconciled row is acknowledged", () => {
    const input = buildTransactionUpdate(
      { ...txn, counterpartCleared: "Reconciled" },
      fields(),
      true
    );
    expect(input?.acknowledgeReconciled).toBe(true);
  });
  test("unreadable fields send nothing", () => {
    expect(buildTransactionUpdate(txn, fields({ date: undefined }), true)).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";
import { payeeAutofillPatch } from "./payee-autofill";
import type { PayeeAutofillSource, RegisterDraft } from "./payee-autofill";

/** Small builders so each case reads as the scenario it describes. */
const payee = (fields: Partial<PayeeAutofillSource> = {}): PayeeAutofillSource => ({
  autofillCategoryId: null,
  autofillMemo: null,
  ...fields,
});

const emptyRow = (fields: Partial<RegisterDraft> = {}): RegisterDraft => ({
  categoryId: null,
  memo: "",
  ...fields,
});

const categories = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("payeeAutofillPatch: the amount is left for the user", () => {
  test("a remembered amount is never filled in", () => {
    // Shaped like the register's own row, empty money fields and all.
    const rent = { ...payee({ autofillCategoryId: 3 }), autofillAmount: "-42.00" };
    const row = { ...emptyRow(), outflow: "", inflow: "" };
    expect(payeeAutofillPatch(rent, row, categories)).toEqual({ categoryId: 3 });
  });
});

describe("payeeAutofillPatch: autofill never overwrites what the user already entered", () => {
  test("a category the user picked stands", () => {
    const patch = payeeAutofillPatch(
      payee({ autofillCategoryId: 2 }),
      emptyRow({ categoryId: 3 }),
      categories
    );
    expect(patch).toEqual({});
  });

  test("a memo the user typed stands", () => {
    const patch = payeeAutofillPatch(
      payee({ autofillMemo: "monthly" }),
      emptyRow({ memo: "split with Sam" }),
      categories
    );
    expect(patch).toEqual({});
  });

  test("untouched fields still fill even when a neighbouring field is taken", () => {
    const patch = payeeAutofillPatch(
      payee({ autofillCategoryId: 2, autofillMemo: "monthly" }),
      emptyRow({ memo: "split with Sam" }),
      categories
    );
    expect(patch).toEqual({ categoryId: 2 });
  });
});

describe("payeeAutofillPatch: only a memo with something in it is worth copying", () => {
  test("the empty memo most imported payees carry is skipped", () => {
    expect(payeeAutofillPatch(payee({ autofillMemo: "" }), emptyRow(), categories)).toEqual({});
    expect(payeeAutofillPatch(payee({ autofillMemo: null }), emptyRow(), categories)).toEqual({});
  });

  test("a whitespace-only memo is skipped", () => {
    expect(payeeAutofillPatch(payee({ autofillMemo: "   " }), emptyRow(), categories)).toEqual({});
  });

  test("a real memo is copied across, trimmed", () => {
    expect(payeeAutofillPatch(payee({ autofillMemo: " gym dues " }), emptyRow(), categories)).toEqual(
      { memo: "gym dues" }
    );
  });
});

describe("payeeAutofillPatch: a category the picker cannot show is never set", () => {
  test("an autofill category outside the selectable list is skipped", () => {
    const patch = payeeAutofillPatch(payee({ autofillCategoryId: 99 }), emptyRow(), categories);
    expect(patch).toEqual({});
  });

  test("with no categories loaded yet, nothing is set", () => {
    const patch = payeeAutofillPatch(payee({ autofillCategoryId: 1 }), emptyRow(), []);
    expect(patch).toEqual({});
  });

  test("a selectable autofill category is set", () => {
    const patch = payeeAutofillPatch(payee({ autofillCategoryId: 1 }), emptyRow(), categories);
    expect(patch).toEqual({ categoryId: 1 });
  });
});

describe("payeeAutofillPatch: a fully configured payee fills the row at once", () => {
  test("category and memo both land on an empty row", () => {
    const patch = payeeAutofillPatch(
      payee({ autofillCategoryId: 3, autofillMemo: "rent" }),
      emptyRow(),
      categories
    );
    expect(patch).toEqual({ categoryId: 3, memo: "rent" });
  });

  test("a payee with no autofill at all changes nothing", () => {
    expect(payeeAutofillPatch(payee(), emptyRow(), categories)).toEqual({});
  });
});

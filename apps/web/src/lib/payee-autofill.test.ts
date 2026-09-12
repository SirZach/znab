import { describe, expect, test } from "bun:test";
import { payeeAutofillPatch } from "./payee-autofill";
import type { PayeeAutofillSource, RegisterDraft } from "./payee-autofill";

/** Small builders so each case reads as the scenario it describes. */
const payee = (fields: Partial<PayeeAutofillSource> = {}): PayeeAutofillSource => ({
  autofillCategoryId: null,
  autofillAmount: null,
  autofillMemo: null,
  ...fields,
});

const emptyRow = (fields: Partial<RegisterDraft> = {}): RegisterDraft => ({
  categoryId: null,
  memo: "",
  outflow: "",
  inflow: "",
  ...fields,
});

const categories = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("payeeAutofillPatch: the amount's sign decides which money field it fills", () => {
  test("a negative autofill amount is an outflow, written without its sign", () => {
    const patch = payeeAutofillPatch(payee({ autofillAmount: "-105.44" }), emptyRow(), categories);
    expect(patch).toEqual({ outflow: "105.44" });
  });

  test("a positive autofill amount is an inflow", () => {
    const patch = payeeAutofillPatch(payee({ autofillAmount: "3.20" }), emptyRow(), categories);
    expect(patch).toEqual({ inflow: "3.20" });
  });

  test("amounts are padded to cents so the number input shows a clean value", () => {
    expect(payeeAutofillPatch(payee({ autofillAmount: "-7" }), emptyRow(), categories)).toEqual({
      outflow: "7.00",
    });
    expect(payeeAutofillPatch(payee({ autofillAmount: "12.5" }), emptyRow(), categories)).toEqual({
      inflow: "12.50",
    });
  });
});

describe("payeeAutofillPatch: an amount it cannot use fills nothing", () => {
  test("a payee with no remembered amount leaves both money fields alone", () => {
    expect(payeeAutofillPatch(payee({ autofillAmount: null }), emptyRow(), categories)).toEqual({});
  });

  test("zero is not worth filling in", () => {
    expect(payeeAutofillPatch(payee({ autofillAmount: "0" }), emptyRow(), categories)).toEqual({});
    expect(payeeAutofillPatch(payee({ autofillAmount: "0.00" }), emptyRow(), categories)).toEqual({});
  });

  test("an unreadable amount is skipped rather than guessed at", () => {
    expect(payeeAutofillPatch(payee({ autofillAmount: "" }), emptyRow(), categories)).toEqual({});
    expect(payeeAutofillPatch(payee({ autofillAmount: "abc" }), emptyRow(), categories)).toEqual({});
  });
});

describe("payeeAutofillPatch: autofill never overwrites what the user already entered", () => {
  test("a half-typed outflow blocks the amount, including the empty inflow beside it", () => {
    const patch = payeeAutofillPatch(
      payee({ autofillAmount: "-105.44" }),
      emptyRow({ outflow: "9" }),
      categories
    );
    expect(patch).toEqual({});
  });

  test("a typed inflow blocks the amount too", () => {
    const patch = payeeAutofillPatch(
      payee({ autofillAmount: "-105.44" }),
      emptyRow({ inflow: "9" }),
      categories
    );
    expect(patch).toEqual({});
  });

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
      payee({ autofillCategoryId: 2, autofillAmount: "-105.44", autofillMemo: "monthly" }),
      emptyRow({ memo: "split with Sam" }),
      categories
    );
    expect(patch).toEqual({ categoryId: 2, outflow: "105.44" });
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

describe("payeeAutofillPatch: a fully configured payee fills the whole row at once", () => {
  test("category, amount and memo all land on an empty row", () => {
    const patch = payeeAutofillPatch(
      payee({ autofillCategoryId: 3, autofillAmount: "-42.00", autofillMemo: "rent" }),
      emptyRow(),
      categories
    );
    expect(patch).toEqual({ categoryId: 3, outflow: "42.00", memo: "rent" });
  });

  test("a payee with no autofill at all changes nothing", () => {
    expect(payeeAutofillPatch(payee(), emptyRow(), categories)).toEqual({});
  });
});

import { describe, expect, test } from "bun:test";
import {
  autofillDraft,
  filterPayees,
  hasAutofill,
  mergePlan,
  mergeSummary,
  payeeCountLabel,
  renameRulesTitle,
} from "./payees";

const blank = { autofillCategoryId: null, autofillMemo: null };

describe("hasAutofill", () => {
  test("an imported empty memo is no autofill at all", () => {
    expect(hasAutofill({ ...blank, autofillMemo: " " })).toBe(false);
    expect(hasAutofill(blank)).toBe(false);
  });

  test("any one real default counts", () => {
    expect(hasAutofill({ ...blank, autofillCategoryId: 4 })).toBe(true);
    expect(hasAutofill({ ...blank, autofillMemo: "rent" })).toBe(true);
  });
});

describe("filterPayees", () => {
  const payees = [{ name: "Grocer" }, { name: "Gas Co" }, { name: "Landlord" }];

  test("matches part of a name, ignoring case and edge spaces", () => {
    expect(filterPayees(payees, "  gRo ")).toEqual([{ name: "Grocer" }]);
  });

  test("a blank search is the whole list", () => {
    expect(filterPayees(payees, "   ")).toBe(payees);
  });
});

describe("labels", () => {
  test("the count says how many match only while searching", () => {
    expect(payeeCountLabel(2, 10, true)).toBe("2 of 10 payees");
    expect(payeeCountLabel(10, 10, false)).toBe("10 payees");
  });

  test("rename rules are counted in the singular and plural", () => {
    expect(renameRulesTitle(1)).toBe("1 rename rule");
    expect(renameRulesTitle(3)).toBe("3 rename rules");
  });
});

describe("mergePlan and mergeSummary", () => {
  const a = { id: 1, name: "Grocer", transactionCount: 4 };
  const b = { id: 2, name: "GROCER INC", transactionCount: 1 };
  const c = { id: 3, name: "Grocer Ltd", transactionCount: 2 };

  test("every other checked payee is folded into the one kept", () => {
    const { sources, moving } = mergePlan([a, b, c], a);
    expect(sources.map((p) => p.id)).toEqual([2, 3]);
    expect(moving).toBe(3);
    expect(mergeSummary(a, sources.length, moving)).toBe(
      'Merge 2 payees into "Grocer", moving 3 transactions. The other names are removed.'
    );
  });

  test("speaks in the singular for one of each", () => {
    expect(mergeSummary(a, 1, 1)).toBe(
      'Merge 1 payee into "Grocer", moving 1 transaction. The other names are removed.'
    );
  });

  test("with no payee kept yet, it asks for one", () => {
    expect(mergeSummary(null, 3, 7)).toBe("Choose which payee to keep.");
  });
});

describe("autofillDraft", () => {
  const options = [{ id: 4 }, { id: 5 }];

  test("starts from the saved defaults", () => {
    expect(autofillDraft({ autofillCategoryId: 4, autofillMemo: "rent" }, options)).toEqual({
      savedCategoryHidden: false,
      categoryId: 4,
      memo: "rent",
    });
    expect(autofillDraft(blank, options)).toEqual({
      savedCategoryHidden: false,
      categoryId: "",
      memo: "",
    });
  });

  test("drops a saved category the picker cannot show", () => {
    expect(autofillDraft({ ...blank, autofillCategoryId: 9 }, options)).toMatchObject({
      savedCategoryHidden: true,
      categoryId: "",
    });
  });

  test("keeps it while the options have not arrived", () => {
    expect(autofillDraft({ ...blank, autofillCategoryId: 9 }, [])).toMatchObject({
      savedCategoryHidden: false,
      categoryId: 9,
    });
  });
});

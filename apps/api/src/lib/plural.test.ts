import { describe, expect, test } from "bun:test";
import { countOf, pluralize } from "./plural";

describe("pluralize", () => {
  test("one is singular, anything else plural", () => {
    expect(pluralize(1, "transaction")).toBe("transaction");
    expect(pluralize(0, "transaction")).toBe("transactions");
    expect(pluralize(2, "category", "categories")).toBe("categories");
  });

  test("countOf puts the count in front", () => {
    expect(countOf(1, "category", "categories")).toBe("1 category");
    expect(countOf(3, "transaction")).toBe("3 transactions");
  });
});

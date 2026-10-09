import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { IS_CREDIT_ACCOUNT, IS_INCOME, onBudgetMoneySource } from "./money-source";

const render = (fragment: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  new PgDialect().sqlToQuery(fragment);

describe("onBudgetMoneySource", () => {
  test("reads on-budget rows and split parts, scoped to the budget", () => {
    const { sql, params } = render(onBudgetMoneySource(7));
    expect(sql).toContain("a.on_budget = true");
    expect(sql).toContain("t.is_split = false");
    expect(sql).toContain("FROM sub_transactions s");
    expect(params).toEqual([7, 7]);
  });

  test("keeps categorised transfers, as the budget page counts them", () => {
    expect(render(onBudgetMoneySource(1)).sql).not.toContain("is_transfer");
  });

  test("applies the since date to both halves of the union", () => {
    const { sql, params } = render(onBudgetMoneySource(1, { since: "2026-01-01" }));
    expect(sql.match(/t\.date >= \$\d+::date/g)).toHaveLength(2);
    expect(params).toEqual([1, "2026-01-01", 1, "2026-01-01"]);
  });

  test("leaves the date open when since is null", () => {
    expect(render(onBudgetMoneySource(1, { since: null })).sql).not.toContain("t.date >=");
  });
});

describe("classification fragments", () => {
  test("credit accounts come from the lib constant", () => {
    expect(render(IS_CREDIT_ACCOUNT).params).toEqual(["CreditCard", "OtherLiability"]);
  });

  test("income comes from the lib constants", () => {
    expect(render(IS_INCOME).params).toEqual([
      "Category/__ImmediateIncome__",
      "Category/__DeferredIncome__",
    ]);
  });
});

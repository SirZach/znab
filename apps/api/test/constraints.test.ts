/** The CHECK constraints on the vocabulary columns hold in the database itself. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { accounts, categories, monthlyBudgets, scheduledTransactions, transactions } from "@znab/db";
import { withCaller } from "./harness";

test("vocabulary columns reject values outside their vocabulary", async () => {
  await withCaller(async ({ tx, seed }) => {
    const checking = seed.accounts.checking.id;
    const rejects = async (write: (t: typeof tx) => Promise<unknown>, constraint: string) => {
      // A savepoint, so the failed statement does not abort the test's transaction
      const error = await tx.transaction(write).then(
        () => null,
        (e: unknown) => e
      );
      expect(String((error as { cause?: unknown })?.cause ?? error)).toContain(constraint);
    };

    await rejects(
      (t) => t.update(categories).set({ goalType: "XX" }).where(eq(categories.id, seed.categories.rent.id)),
      "categories_goal_type_check"
    );
    const txn = { ynabId: crypto.randomUUID(), budgetId: seed.budgetId, accountId: checking, amount: "1.00", date: "2025-01-01" };
    await rejects((t) => t.insert(transactions).values({ ...txn, cleared: "Pending" }), "transactions_cleared_check");
    await rejects((t) => t.insert(transactions).values({ ...txn, flagColor: "Teal" }), "transactions_flag_color_check");
    await rejects(
      (t) => t.insert(scheduledTransactions).values({ ...txn, frequency: "Monthly", cleared: "Pending" }),
      "scheduled_transactions_cleared_check"
    );
    await rejects(
      (t) =>
        t.insert(monthlyBudgets).values({
          ynabId: crypto.randomUUID(),
          budgetId: seed.budgetId,
          month: "2025-01-01",
          overspendingHandling: "Sometimes",
        }),
      "monthly_budgets_overspending_handling_check"
    );

    // Nullable columns still take null
    await tx.insert(transactions).values({ ...txn, flagColor: null });

    // Copied straight from YNAB 4 by the sync, which knows values znab does
    // not, so these stay unconstrained
    await tx.update(accounts).set({ accountType: "Mortgage" }).where(eq(accounts.id, checking));
    await tx.insert(scheduledTransactions).values({ ...txn, ynabId: crypto.randomUUID(), frequency: "Never" });
  });
});

/**
 * Router test harness. Every test runs inside one database transaction that is
 * always rolled back, so the suite leaves znab_test exactly as it found it.
 * Routers only ever reach the database through `ctx.db`, and their own
 * `ctx.db.transaction` calls become savepoints inside ours.
 */
import { TRPCError } from "@trpc/server";
import { TransactionRollbackError, and, eq, isNull, sql } from "drizzle-orm";
import {
  accounts,
  budgets,
  categories,
  categoryGroups,
  db,
  payees,
  transactions,
  users,
  type User,
} from "@znab/db";
import { expect } from "bun:test";
import { appRouter } from "../src/routers";

// Literals rather than imports from src/lib, so the fixture does not move when
// the helpers there are reorganised. They are YNAB 4's own ids.
export const IMMEDIATE_INCOME = "Category/__ImmediateIncome__";

/** The server's local calendar day, offset by `days`, as the routers read "today". */
export function localDay(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Caller = ReturnType<typeof appRouter.createCaller>;

export function callerFor(tx: Tx, user: User): Caller {
  return appRouter.createCaller({
    db: tx as unknown as typeof db,
    user,
    req: new Request("http://test"),
  });
}

type AccountSpec = { key: string; name: string; accountType: string; onBudget: boolean };

const ACCOUNTS: AccountSpec[] = [
  { key: "checking", name: "Checking", accountType: "Checking", onBudget: true },
  { key: "savings", name: "Savings", accountType: "Savings", onBudget: true },
  { key: "tracking", name: "Brokerage", accountType: "InvestmentAccount", onBudget: false },
  { key: "credit", name: "Visa", accountType: "CreditCard", onBudget: true },
];

/**
 * One user and one budget, shaped like an imported YNAB 4 budget:
 * - accounts: checking and savings (on budget), tracking (off budget), credit
 *   (on-budget credit card), each with its "Transfer : <name>" payee
 * - user groups "Monthly Bills" (rent, electric) and "Everyday" (groceries, fun)
 * - YNAB 4's system groups __Hidden__ and __Internal__ (isSystem), with one
 *   category under __Hidden__
 * - one ordinary payee, "Corner Grocer"
 * Income is not a category row: it is `categoryYnabId` IMMEDIATE_INCOME with a
 * null `categoryId`, exactly as the importer stores it.
 */
export async function seedBudget(tx: Tx, slug = `test-${crypto.randomUUID()}`) {
  const tag = crypto.randomUUID();
  const [user] = await tx.insert(users).values({ slug, displayName: slug }).returning();
  const [budget] = await tx
    .insert(budgets)
    .values({ ynabId: `Budget/${tag}`, userId: user!.id, name: `Budget ${slug}` })
    .returning();
  const budgetId = budget!.id;

  const acct: Record<string, typeof accounts.$inferSelect> = {};
  const transferPayee: Record<string, number> = {};
  for (const [i, spec] of ACCOUNTS.entries()) {
    const ynabId = `Account/${crypto.randomUUID()}`;
    const [row] = await tx
      .insert(accounts)
      .values({
        ynabId,
        budgetId,
        name: spec.name,
        accountType: spec.accountType,
        onBudget: spec.onBudget,
        sortOrder: i,
      })
      .returning();
    acct[spec.key] = row!;
    const [p] = await tx
      .insert(payees)
      .values({
        ynabId: `Payee/Transfer:${ynabId}`,
        budgetId,
        name: `Transfer : ${spec.name}`,
        targetAccountId: row!.id,
      })
      .returning({ id: payees.id });
    transferPayee[spec.key] = p!.id;
  }

  const group = async (ynabId: string, name: string, sortOrder: number, isSystem = false) => {
    const [g] = await tx
      .insert(categoryGroups)
      .values({ ynabId, budgetId, name, isSystem, sortOrder })
      .returning();
    return g!;
  };
  const category = async (groupId: number, name: string, sortOrder: number) => {
    const [c] = await tx
      .insert(categories)
      .values({ ynabId: `Category/${crypto.randomUUID()}`, budgetId, groupId, name, sortOrder })
      .returning();
    return c!;
  };

  const bills = await group(`MasterCategory/${crypto.randomUUID()}`, "Monthly Bills", 0);
  const everyday = await group(`MasterCategory/${crypto.randomUUID()}`, "Everyday", 1);
  const hiddenGroup = await group("MasterCategory/__Hidden__", "Hidden Categories", 9000, true);
  const internalGroup = await group("MasterCategory/__Internal__", "Internal", 9001, true);

  const cats = {
    rent: await category(bills.id, "Rent", 0),
    electric: await category(bills.id, "Electric", 1),
    groceries: await category(everyday.id, "Groceries", 0),
    fun: await category(everyday.id, "Fun", 1),
    hiddenSystem: await category(hiddenGroup.id, "Old Envelope", 0),
  };

  const [grocer] = await tx
    .insert(payees)
    .values({ ynabId: `Payee/${crypto.randomUUID()}`, budgetId, name: "Corner Grocer" })
    .returning();

  return {
    user: user!,
    budget: budget!,
    budgetId,
    accounts: acct as Record<"checking" | "savings" | "tracking" | "credit", typeof accounts.$inferSelect>,
    transferPayee: transferPayee as Record<"checking" | "savings" | "tracking" | "credit", number>,
    groups: { bills, everyday, hidden: hiddenGroup, internal: internalGroup },
    categories: cats,
    payees: { grocer: grocer! },
  };
}

export type Seed = Awaited<ReturnType<typeof seedBudget>>;

export type Harness = {
  tx: Tx;
  /** The main fixture budget, and a caller acting as its owner. */
  seed: Seed;
  caller: Caller;
  /** A second user with a budget of their own, for cross-budget checks. */
  other: Seed;
  otherCaller: Caller;
};

/**
 * Opens a transaction, seeds both budgets, runs `fn` with callers for each
 * owner, and always rolls back, whether `fn` passed or threw.
 */
export async function withCaller(fn: (h: Harness) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const seed = await seedBudget(tx);
      const other = await seedBudget(tx);
      await fn({
        tx,
        seed,
        caller: callerFor(tx, seed.user),
        other,
        otherCaller: callerFor(tx, other.user),
      });
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

/** Asserts a tRPC call rejects with the given error code. */
export async function expectTrpcError(promise: Promise<unknown>, code: TRPCError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(TRPCError);
  expect((error as TRPCError).code).toBe(code);
}

/** Inserts an income row (To be Budgeted) the way the importer stores one. */
export async function addIncome(tx: Tx, seed: Seed, amount: number, date: string, accountId?: number) {
  const [row] = await tx
    .insert(transactions)
    .values({
      ynabId: crypto.randomUUID(),
      budgetId: seed.budgetId,
      accountId: accountId ?? seed.accounts.checking.id,
      categoryYnabId: IMMEDIATE_INCOME,
      amount: String(amount),
      date,
      cleared: "Cleared",
    })
    .returning();
  return row!;
}

/** Live rows of `transactions` in an account, oldest id first. */
export function liveTransactions(tx: Tx, accountId: number) {
  return tx.query.transactions.findMany({
    where: and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)),
    orderBy: (t, { asc }) => [asc(t.id)],
  });
}

/** Row count of a table, for checks that nothing extra was written. */
export async function countRows(tx: Tx, table: typeof payees | typeof transactions, budgetId: number) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.budgetId, budgetId));
  return row!.n;
}

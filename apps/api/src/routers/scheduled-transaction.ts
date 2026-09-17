import { z } from "zod";
import { eq, and, inArray, isNull, asc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { scheduledTransactions, transactions, payees, accounts } from "@znab/db";
import {
  createScheduledTransactionSchema,
  updateScheduledTransactionSchema,
  type FrequencyValue,
} from "@znab/shared";
import { TRPCError } from "@trpc/server";
import { assertBudgetAccess, assertIdsInBudget, ownedBudgetIds, type AuthedContext } from "../lib/authz";
import { transferCategoryId, transferPayeeName, transferPayeeYnabId } from "../lib/transfer";
import { isOneOff, nextOccurrence, occurrencesThrough, parseDate } from "../lib/schedule";

/** An open transaction, the way the account router names the same thing. */
type Tx = Parameters<Parameters<AuthedContext["db"]["transaction"]>[0]>[0];

/**
 * How far past its due date one schedule will be caught up in a single sweep.
 * A monthly bill left alone for a year is nine or ten rows; a daily schedule
 * left alone since 2013 is nearly five thousand, and entering those unasked
 * would bury the register it was meant to help.
 */
const MAX_CATCH_UP = 60;

/** How far ahead the register looks by default, in days. */
const DEFAULT_HORIZON_DAYS = 30;

/** The server's own calendar day, the way the account router reads it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `days` after today, as a civil date. */
function horizon(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * TwiceAMonth is the only frequency that reads the start day, and YNAB 4 writes
 * a meaningless 0 there on all the others. Storing null instead keeps a row
 * from claiming a day it does not use.
 */
function twiceMonthDayFor(
  frequency: FrequencyValue,
  twiceMonthDay: number | null | undefined,
  date: string,
): number | null {
  if (frequency !== "TwiceAMonth") return null;
  return twiceMonthDay || parseDate(date).day;
}

/** The recurrence shape the rules take, off a stored row. */
function recurrenceOf(row: {
  date: string;
  frequency: string;
  twiceMonthDay: number | null;
}) {
  return {
    date: row.date,
    frequency: row.frequency as FrequencyValue,
    twiceMonthDay: row.twiceMonthDay,
  };
}

/** A schedule as the client reads it, with the dates the rules work out. */
function withDueness<T extends { date: string; frequency: string; twiceMonthDay: number | null }>(
  row: T,
  asOf: string,
) {
  const due = occurrencesThrough(recurrenceOf(row), asOf, MAX_CATCH_UP);
  return {
    ...row,
    // How many occurrences have come round without being entered. A schedule
    // imported years ago and never run is behind by more than one.
    dueCount: due.length,
    isDue: due.length > 0,
    nextDate: nextOccurrence(recurrenceOf(row), asOf) ?? (due.length > 0 ? null : row.date),
  };
}

/**
 * Reads one schedule, scoped to the budgets the caller owns, for a write that
 * addresses it by row id alone.
 */
async function loadScheduled(db: Pick<Tx, "query">, ctx: AuthedContext, id: number) {
  const row = await db.query.scheduledTransactions.findFirst({
    where: and(
      eq(scheduledTransactions.id, id),
      isNull(scheduledTransactions.deletedAt),
      inArray(scheduledTransactions.budgetId, ownedBudgetIds(ctx)),
    ),
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled transaction not found" });
  return row;
}

/**
 * A "Once" schedule that has been entered is spent, and leaving it in place
 * would offer it forever.
 */
async function retire(tx: Tx, id: number) {
  await tx
    .update(scheduledTransactions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(scheduledTransactions.id, id));
}

async function moveTo(tx: Tx, id: number, date: string) {
  await tx
    .update(scheduledTransactions)
    .set({ date, updatedAt: new Date() })
    .where(eq(scheduledTransactions.id, id));
}

/**
 * Moves a schedule past the occurrence just dealt with, or retires it when it
 * never comes round again.
 */
async function advance(
  tx: Tx,
  row: { id: number; date: string; frequency: string; twiceMonthDay: number | null },
  past: string,
) {
  const next = nextOccurrence(recurrenceOf(row), past);
  if (next === null) {
    await retire(tx, row.id);
    return null;
  }
  await moveTo(tx, row.id, next);
  return next;
}

/**
 * Writes the transaction a scheduled occurrence stands for, and the far side
 * too when the schedule is a transfer.
 *
 * A scheduled transfer is declared exactly as a live one is, by the payee that
 * stands in for the other account: YNAB 4's export carries a `targetAccountId`
 * on the scheduled entity but the importer never stored it, and it would be a
 * second source of truth for something the payee already says.
 */
async function enterOccurrence(
  tx: Tx,
  row: typeof scheduledTransactions.$inferSelect,
  date: string,
) {
  const payee = row.payeeId
    ? await tx.query.payees.findFirst({
        where: and(
          eq(payees.id, row.payeeId),
          eq(payees.budgetId, row.budgetId),
          isNull(payees.deletedAt),
        ),
        columns: { id: true, name: true, targetAccountId: true },
      })
    : null;

  if (payee && payee.targetAccountId !== null) {
    const farAccountId = payee.targetAccountId;
    if (farAccountId === row.accountId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A transfer has to go to a different account.",
      });
    }

    const ends = await tx.query.accounts.findMany({
      where: and(
        inArray(accounts.id, [row.accountId, farAccountId]),
        eq(accounts.budgetId, row.budgetId),
        isNull(accounts.deletedAt),
      ),
      columns: { id: true, name: true, ynabId: true, onBudget: true, hidden: true },
    });
    const near = ends.find((a) => a.id === row.accountId);
    const far = ends.find((a) => a.id === farAccountId);
    if (!near) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
    if (!far) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `"${payee.name}" points at an account that is no longer in this budget.`,
      });
    }

    const nearYnabId = crypto.randomUUID();
    const farYnabId = crypto.randomUUID();

    // The far side names this account through the payee pointing back at it,
    // made on demand for a budget that has none, exactly as entering a transfer
    // by hand does.
    const backPayee = await tx.query.payees.findFirst({
      where: and(
        eq(payees.budgetId, row.budgetId),
        eq(payees.targetAccountId, near.id),
        isNull(payees.deletedAt),
      ),
      columns: { id: true },
    });
    let farPayeeId = backPayee?.id;
    if (!farPayeeId) {
      const [created] = await tx
        .insert(payees)
        .values({
          ynabId: transferPayeeYnabId(near.ynabId),
          budgetId: row.budgetId,
          name: transferPayeeName(near.name),
          targetAccountId: near.id,
          enabled: !near.hidden,
        })
        .returning({ id: payees.id });
      farPayeeId = created!.id;
    }

    const [nearTxn] = await tx
      .insert(transactions)
      .values({
        ynabId: nearYnabId,
        budgetId: row.budgetId,
        accountId: near.id,
        payeeId: payee.id,
        categoryId: transferCategoryId(near, far, row.categoryId),
        amount: row.amount,
        date,
        cleared: "Uncleared",
        accepted: true,
        memo: row.memo,
        dateFromSchedule: date,
        isTransfer: true,
        transferAccountId: far.id,
        transferTransactionId: farYnabId,
      })
      .returning();

    await tx.insert(transactions).values({
      ynabId: farYnabId,
      budgetId: row.budgetId,
      accountId: far.id,
      payeeId: farPayeeId,
      categoryId: transferCategoryId(far, near, row.categoryId),
      amount: String(-Number(row.amount)),
      date,
      cleared: "Uncleared",
      accepted: true,
      memo: row.memo,
      dateFromSchedule: date,
      isTransfer: true,
      transferAccountId: near.id,
      transferTransactionId: nearYnabId,
    });

    return nearTxn!;
  }

  const [txn] = await tx
    .insert(transactions)
    .values({
      ynabId: crypto.randomUUID(),
      budgetId: row.budgetId,
      accountId: row.accountId,
      payeeId: row.payeeId,
      categoryId: row.categoryId,
      amount: row.amount,
      date,
      // A schedule says money is expected, not that the bank has seen it.
      cleared: "Uncleared",
      accepted: true,
      memo: row.memo,
      // What marks a row as having come from a schedule. 1,136 imported
      // transactions already carry it, written by YNAB 4's own auto-entry.
      dateFromSchedule: date,
    })
    .returning();

  return txn!;
}

export const scheduledTransactionRouter = router({
  /** Every live schedule in the budget, for the manage screen. */
  list: protectedProcedure
    .input(z.object({ budgetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      const rows = await ctx.db.query.scheduledTransactions.findMany({
        where: and(
          eq(scheduledTransactions.budgetId, input.budgetId),
          isNull(scheduledTransactions.deletedAt),
        ),
        with: {
          payee: { columns: { id: true, name: true, targetAccountId: true } },
          category: { columns: { id: true, name: true } },
          account: { columns: { id: true, name: true, hidden: true } },
        },
        orderBy: [asc(scheduledTransactions.date), asc(scheduledTransactions.id)],
      });

      const asOf = today();
      return rows.map((row) => withDueness(row, asOf));
    }),

  /**
   * The occurrences falling between now and the horizon, flattened one row per
   * occurrence, which is what a register shows above its own rows.
   */
  upcoming: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        accountId: z.number().int().positive().optional(),
        days: z.number().int().min(0).max(365).default(DEFAULT_HORIZON_DAYS),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      const rows = await ctx.db.query.scheduledTransactions.findMany({
        where: and(
          eq(scheduledTransactions.budgetId, input.budgetId),
          isNull(scheduledTransactions.deletedAt),
          ...(input.accountId ? [eq(scheduledTransactions.accountId, input.accountId)] : []),
        ),
        with: {
          payee: { columns: { id: true, name: true, targetAccountId: true } },
          category: { columns: { id: true, name: true } },
          account: { columns: { id: true, name: true } },
        },
      });

      const asOf = today();
      const through = horizon(input.days);
      const occurrences = rows.flatMap((row) =>
        occurrencesThrough(recurrenceOf(row), through, MAX_CATCH_UP).map((date) => ({
          scheduledTransactionId: row.id,
          date,
          // Only the first occurrence of an overdue schedule can be entered:
          // entering it is what moves the schedule on to the next.
          due: date <= asOf,
          accountId: row.accountId,
          accountName: row.account.name,
          payeeId: row.payeeId,
          payeeName: row.payee?.name ?? null,
          categoryId: row.categoryId,
          categoryName: row.category?.name ?? null,
          isTransfer: row.payee?.targetAccountId != null,
          amount: row.amount,
          memo: row.memo,
          frequency: row.frequency as FrequencyValue,
        })),
      );

      occurrences.sort((a, b) => a.date.localeCompare(b.date) || a.scheduledTransactionId - b.scheduledTransactionId);
      return { occurrences, asOf, through };
    }),

  create: protectedProcedure
    .input(
      createScheduledTransactionSchema.extend({
        budgetId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      await assertIdsInBudget(ctx.db, input.budgetId, {
        categoryId: input.categoryId,
        accountId: input.accountId,
      });

      let payeeId = input.payeeId;
      if (!payeeId && input.payeeName) {
        const [newPayee] = await ctx.db
          .insert(payees)
          .values({
            ynabId: `Payee/${crypto.randomUUID()}`,
            budgetId: input.budgetId,
            name: input.payeeName,
          })
          .returning();
        payeeId = newPayee!.id;
      }
      await assertIdsInBudget(ctx.db, input.budgetId, { payeeId });

      const [created] = await ctx.db
        .insert(scheduledTransactions)
        .values({
          ynabId: crypto.randomUUID(),
          budgetId: input.budgetId,
          accountId: input.accountId,
          payeeId,
          categoryId: input.categoryId,
          amount: String(input.amount),
          date: input.date,
          frequency: input.frequency,
          twiceMonthDay: twiceMonthDayFor(input.frequency, input.twiceMonthDay, input.date),
          memo: input.memo,
        })
        .returning();

      return created!;
    }),

  update: protectedProcedure
    .input(updateScheduledTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, payeeName, payeeId, amount, frequency, twiceMonthDay, ...rest } = input;

      return ctx.db.transaction(async (tx) => {
        const row = await loadScheduled(tx, ctx, id);

        await assertIdsInBudget(tx, row.budgetId, {
          payeeId,
          categoryId: rest.categoryId,
          accountId: rest.accountId,
        });

        let resolvedPayeeId = payeeId;
        if (resolvedPayeeId === undefined && payeeName) {
          const [newPayee] = await tx
            .insert(payees)
            .values({
              ynabId: `Payee/${crypto.randomUUID()}`,
              budgetId: row.budgetId,
              name: payeeName,
            })
            .returning();
          resolvedPayeeId = newPayee!.id;
        }

        // The start day follows whichever frequency and date the row ends up
        // with, not just the ones this call happened to send.
        const nextFrequency = (frequency ?? row.frequency) as FrequencyValue;
        const nextDate = rest.date ?? row.date;

        const [updated] = await tx
          .update(scheduledTransactions)
          .set({
            ...rest,
            ...(resolvedPayeeId !== undefined ? { payeeId: resolvedPayeeId } : {}),
            ...(amount != null ? { amount: String(amount) } : {}),
            ...(frequency !== undefined ? { frequency } : {}),
            twiceMonthDay: twiceMonthDayFor(
              nextFrequency,
              twiceMonthDay !== undefined ? twiceMonthDay : row.twiceMonthDay,
              nextDate,
            ),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(scheduledTransactions.id, id),
              inArray(scheduledTransactions.budgetId, ownedBudgetIds(ctx)),
            ),
          )
          .returning();

        return updated!;
      });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        await loadScheduled(tx, ctx, input.id);
        // A soft delete, like everything else here: the transactions already
        // entered from this schedule stay, and stay pointing at nothing.
        const [removed] = await tx
          .update(scheduledTransactions)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(scheduledTransactions.id, input.id),
              inArray(scheduledTransactions.budgetId, ownedBudgetIds(ctx)),
            ),
          )
          .returning();
        return removed!;
      });
    }),

  /** Enters the occurrence the schedule is standing on, and moves it along. */
  enter: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const row = await loadScheduled(tx, ctx, input.id);
        const entered = await enterOccurrence(tx, row, row.date);
        const next = await advance(tx, row, row.date);
        return { transaction: entered, enteredDate: row.date, nextDate: next };
      });
    }),

  /** Moves the schedule past this occurrence without entering anything. */
  skip: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const row = await loadScheduled(tx, ctx, input.id);
        if (isOneOff(row.frequency as FrequencyValue)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This happens only once, so there is nothing to skip to. Delete it instead.",
          });
        }
        const next = await advance(tx, row, row.date);
        return { skippedDate: row.date, nextDate: next };
      });
    }),

  /**
   * Enters everything that has come due, catching each schedule up occurrence
   * by occurrence. This is YNAB 4's auto-entry, asked for rather than run in
   * the background: znab has no scheduler, and writing transactions into a
   * register the moment a page loads is worse than a button that says so.
   */
  enterDue: protectedProcedure
    .input(
      z.object({
        budgetId: z.number().int().positive(),
        accountId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      const asOf = today();

      return ctx.db.transaction(async (tx) => {
        const rows = await tx.query.scheduledTransactions.findMany({
          where: and(
            eq(scheduledTransactions.budgetId, input.budgetId),
            isNull(scheduledTransactions.deletedAt),
            ...(input.accountId ? [eq(scheduledTransactions.accountId, input.accountId)] : []),
          ),
        });

        let entered = 0;
        let caughtUp = 0;
        let cappedOut = false;

        for (const row of rows) {
          // The cursor walks the series, and where it stops is where the
          // schedule is left standing: the first occurrence still to come.
          let cursor = row.date;
          let written = 0;
          let spent = false;

          while (cursor <= asOf && written < MAX_CATCH_UP) {
            await enterOccurrence(tx, row, cursor);
            written += 1;
            const next = nextOccurrence(recurrenceOf({ ...row, date: cursor }), cursor);
            if (next === null) {
              spent = true;
              break;
            }
            cursor = next;
          }

          if (written === 0) continue;
          entered += written;
          caughtUp += 1;

          if (spent) {
            await retire(tx, row.id);
          } else {
            // Stopping with the cursor still in the past means the cap stopped
            // it, not the calendar: there is more of this one still to enter.
            if (cursor <= asOf) cappedOut = true;
            await moveTo(tx, row.id, cursor);
          }
        }

        return { entered, schedules: caughtUp, cappedOut, asOf };
      });
    }),
});

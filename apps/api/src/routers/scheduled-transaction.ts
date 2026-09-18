import { z } from "zod";
import { eq, and, inArray, isNull, asc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { scheduledTransactions, transactions, payees, accounts } from "@znab/db";
import {
  FREQUENCY_VALUES,
  createScheduledTransactionSchema,
  updateScheduledTransactionSchema,
  type FrequencyValue,
} from "@znab/shared";
import { TRPCError } from "@trpc/server";
import { assertBudgetAccess, assertIdsInBudget, ownedBudgetIds, type AuthedContext } from "../lib/authz";
import { transferCategoryId, transferPayeeName, transferPayeeYnabId } from "../lib/transfer";
import {
  addDays,
  isOneOff,
  nextOccurrence,
  occurrencesThrough,
  parseDate,
  seriesStart,
} from "../lib/schedule";

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
  anchorDay: number | null;
}) {
  const frequency = row.frequency as FrequencyValue;
  // The column is plain text and the importer writes whatever the export said,
  // so a value the rules do not know would otherwise fall through to the one
  // branch that has no step of its own and come back as a twice-a-month series.
  if (!FREQUENCY_VALUES.includes(frequency)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${row.frequency}" is not a frequency this app knows how to work out.`,
    });
  }
  return {
    date: row.date,
    frequency,
    twiceMonthDay: row.twiceMonthDay,
    anchorDay: row.anchorDay,
  };
}

/** A schedule as the client reads it, with the dates the rules work out. */
function withDueness<
  T extends {
    date: string;
    frequency: string;
    twiceMonthDay: number | null;
    anchorDay: number | null;
    payee: { targetAccountId: number | null } | null;
  },
>(row: T, asOf: string) {
  const due = occurrencesThrough(recurrenceOf(row), asOf, MAX_CATCH_UP);
  return {
    ...row,
    // How many occurrences have come round without being entered. A schedule
    // imported years ago and never run is behind by more than one.
    dueCount: due.length,
    isDue: due.length > 0,
    // A schedule is a transfer when its payee stands in for another account,
    // which is the same rule the register reads, worked out in one place.
    isTransfer: row.payee?.targetAccountId != null,
  };
}

/**
 * Refuses a schedule whose payee stands in for the very account it pays from.
 *
 * Entering one is impossible, and it is checked here rather than only there so
 * the schedule cannot be stored at all: left to be discovered at entry, a
 * single one of these would refuse every sweep of the budget it sits in.
 */
async function assertNotSelfTransfer(
  db: Pick<AuthedContext["db"], "query">,
  budgetId: number,
  payeeId: number | null | undefined,
  accountId: number,
) {
  if (payeeId == null) return;
  const payee = await db.query.payees.findFirst({
    where: and(
      eq(payees.id, payeeId),
      eq(payees.budgetId, budgetId),
      isNull(payees.deletedAt),
    ),
    columns: { targetAccountId: true },
  });
  if (payee?.targetAccountId === accountId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A transfer has to go to a different account.",
    });
  }
}

/**
 * Reads one schedule, scoped to the budgets the caller owns, and locks it for
 * the rest of the transaction.
 *
 * The lock is what stops the same occurrence being entered twice. Entering is a
 * read of the date followed by a write of the next one, so two calls racing,
 * which a double-click on the register's Enter button is enough to produce,
 * would each read the same date, each write a transaction for it, and then both
 * advance the schedule once.
 */
async function loadScheduled(tx: Tx, ctx: AuthedContext, id: number) {
  const [row] = await tx
    .select()
    .from(scheduledTransactions)
    .where(
      and(
        eq(scheduledTransactions.id, id),
        isNull(scheduledTransactions.deletedAt),
        inArray(scheduledTransactions.budgetId, ownedBudgetIds(ctx)),
      ),
    )
    .for("update");
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled transaction not found" });
  return row;
}

/**
 * A "Once" schedule that has been entered is spent, and leaving it in place
 * would offer it forever.
 */
async function retire(tx: Tx, ctx: AuthedContext, id: number) {
  await tx
    .update(scheduledTransactions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(scheduledTransactions.id, id),
        inArray(scheduledTransactions.budgetId, ownedBudgetIds(ctx)),
      ),
    );
}

// Scoped the way `retire` is: every caller reaches these through a read that
// was already scoped, but a helper taking a bare row id and writing to it is
// the exact shape of the defect this repo has already had four times.
async function moveTo(tx: Tx, ctx: AuthedContext, id: number, date: string) {
  await tx
    .update(scheduledTransactions)
    .set({ date, updatedAt: new Date() })
    .where(
      and(
        eq(scheduledTransactions.id, id),
        inArray(scheduledTransactions.budgetId, ownedBudgetIds(ctx)),
      ),
    );
}

/**
 * Moves a schedule past the occurrence just dealt with, or retires it when it
 * never comes round again.
 */
async function advance(
  tx: Tx,
  ctx: AuthedContext,
  row: {
    id: number;
    date: string;
    frequency: string;
    twiceMonthDay: number | null;
    anchorDay: number | null;
  },
  past: string,
) {
  const next = nextOccurrence(recurrenceOf(row), past);
  if (next === null) {
    await retire(tx, ctx, row.id);
    return null;
  }
  await moveTo(tx, ctx, row.id, next);
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
  // The account can go while the schedule pointing at it stays, so the row is
  // only good as long as what it names still exists.
  const into = await tx.query.accounts.findFirst({
    where: and(
      eq(accounts.id, row.accountId),
      eq(accounts.budgetId, row.budgetId),
      isNull(accounts.deletedAt),
    ),
    columns: { id: true },
  });
  if (!into) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "The account this schedule pays from has been deleted, so there is nowhere to enter it. Point the schedule at another account first.",
    });
  }

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

  // A schedule naming a payee that is no longer there must not quietly become
  // one naming nobody. It matters most for a transfer: the payee is the only
  // record of which account the money goes to, so losing it would write the
  // near side alone and let money leave the budget with nothing facing it.
  if (row.payeeId && !payee) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "The payee this schedule names has been deleted, so there is nothing to enter it against. Point the schedule at another payee first.",
    });
  }

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
          payee: { columns: { name: true, targetAccountId: true } },
          category: { columns: { name: true } },
        },
      });

      const asOf = today();
      const through = addDays(asOf, input.days);
      const occurrences = rows.flatMap((row) =>
        occurrencesThrough(recurrenceOf(row), through, MAX_CATCH_UP).map((date) => ({
          scheduledTransactionId: row.id,
          date,
          due: date <= asOf,
          payeeName: row.payee?.name ?? null,
          categoryName: row.category?.name ?? null,
          isTransfer: row.payee?.targetAccountId != null,
          amount: row.amount,
          frequency: row.frequency as FrequencyValue,
        })),
      );

      occurrences.sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.scheduledTransactionId - b.scheduledTransactionId,
      );
      return occurrences;
    }),

  create: protectedProcedure
    .input(
      createScheduledTransactionSchema.extend({
        budgetId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);

      // The payee is made and the schedule written together, so a refused
      // schedule does not leave a payee nobody asked for behind it.
      return ctx.db.transaction(async (tx) => {
        await assertIdsInBudget(tx, input.budgetId, {
          categoryId: input.categoryId,
          accountId: input.accountId,
        });

        let payeeId = input.payeeId;
        if (!payeeId && input.payeeName) {
          const [newPayee] = await tx
            .insert(payees)
            .values({
              ynabId: `Payee/${crypto.randomUUID()}`,
              budgetId: input.budgetId,
              name: input.payeeName,
            })
            .returning();
          payeeId = newPayee!.id;
        }
        await assertIdsInBudget(tx, input.budgetId, { payeeId });
        await assertNotSelfTransfer(tx, input.budgetId, payeeId, input.accountId);

        const twiceMonthDay = twiceMonthDayFor(
          input.frequency,
          input.twiceMonthDay,
          input.date,
        );

        const [created] = await tx
          .insert(scheduledTransactions)
          .values({
            ynabId: crypto.randomUUID(),
            budgetId: input.budgetId,
            accountId: input.accountId,
            payeeId,
            categoryId: input.categoryId,
            amount: String(input.amount),
            date: seriesStart(
              { date: input.date, frequency: input.frequency, twiceMonthDay },
              input.date,
            ),
            frequency: input.frequency,
            twiceMonthDay,
            anchorDay: parseDate(input.date).day,
            memo: input.memo,
          })
          .returning();

        return created!;
      });
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

        await assertNotSelfTransfer(
          tx,
          row.budgetId,
          resolvedPayeeId !== undefined ? resolvedPayeeId : row.payeeId,
          rest.accountId ?? row.accountId,
        );

        // The start day and the anchor follow whichever frequency and date the
        // row ends up with, not just the ones this call happened to send.
        const nextFrequency = (frequency ?? row.frequency) as FrequencyValue;
        const nextDate = rest.date ?? row.date;
        const nextTwiceMonthDay = twiceMonthDayFor(
          nextFrequency,
          twiceMonthDay !== undefined ? twiceMonthDay : row.twiceMonthDay,
          nextDate,
        );

        const [updated] = await tx
          .update(scheduledTransactions)
          .set({
            ...rest,
            ...(resolvedPayeeId !== undefined ? { payeeId: resolvedPayeeId } : {}),
            ...(amount != null ? { amount: String(amount) } : {}),
            ...(frequency !== undefined ? { frequency } : {}),
            date: seriesStart(
              { date: nextDate, frequency: nextFrequency, twiceMonthDay: nextTwiceMonthDay },
              nextDate,
            ),
            twiceMonthDay: nextTwiceMonthDay,
            // A date given by hand is the day the series now means, so it
            // replaces the anchor rather than being clamped against the old one.
            ...(rest.date !== undefined ? { anchorDay: parseDate(rest.date).day } : {}),
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
        const next = await advance(tx, ctx, row, row.date);
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
        const next = await advance(tx, ctx, row, row.date);
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
    .input(z.object({ budgetId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBudgetAccess(ctx, input.budgetId);
      const asOf = today();

      return ctx.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(scheduledTransactions)
          .where(
            and(
              eq(scheduledTransactions.budgetId, input.budgetId),
              isNull(scheduledTransactions.deletedAt),
            ),
          )
          .for("update");

        let entered = 0;
        let caughtUp = 0;
        let cappedOut = false;
        const skipped: { id: number; reason: string }[] = [];

        for (const row of rows) {
          try {
            // A savepoint per schedule, so one that cannot be entered does not
            // roll back the ones that already were. The catch-up of a single
            // schedule stays all or nothing inside it.
            const written = await tx.transaction(async (inner) => {
              // The dates to write are the ones the screens listed as due,
              // read from the same routine, rather than walked separately.
              const due = occurrencesThrough(recurrenceOf(row), asOf, MAX_CATCH_UP);
              for (const date of due) await enterOccurrence(inner, row, date);
              if (due.length > 0) {
                await advance(inner, ctx, row, due[due.length - 1]!);
              }
              return due.length;
            });

            if (written === 0) continue;
            entered += written;
            caughtUp += 1;
            // Hitting the cap means the calendar did not stop it: there is more
            // of this one still waiting.
            if (written >= MAX_CATCH_UP) cappedOut = true;
          } catch (error) {
            skipped.push({
              id: row.id,
              reason:
                error instanceof TRPCError ? error.message : "This one could not be entered.",
            });
          }
        }

        return { entered, schedules: caughtUp, cappedOut, skipped, asOf };
      });
    }),
});

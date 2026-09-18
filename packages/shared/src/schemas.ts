import { z } from "zod";
import {
  ACCOUNT_TYPES,
  ASSIGNABLE_CLEARED_VALUES,
  CLEARED_VALUES,
  FLAG_COLORS,
  FREQUENCY_VALUES,
  REGISTER_SORTS,
  SORT_DIRECTIONS,
} from "./types";

// ─── Transaction ────────────────────────────────────────────────────────────

export const createTransactionSchema = z.object({
  accountId: z.number().int().positive(),
  payeeId: z.number().int().positive().nullable(),
  payeeName: z.string().min(1).optional(), // create payee on the fly
  categoryId: z.number().int().positive().nullable(),
  amount: z.number(), // positive = inflow, negative = outflow
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Not Reconciled: see ASSIGNABLE_CLEARED_VALUES. Reconciling an account is
  // what sets that, so entering a row cannot claim it.
  cleared: z.enum(ASSIGNABLE_CLEARED_VALUES).default("Uncleared"),
  accepted: z.boolean().default(true),
  memo: z.string().optional(),
  // Nullable as well as optional: absent means leave it alone on an update,
  // null means take the flag off, and the two are different answers.
  flagColor: z.enum(FLAG_COLORS).nullable().optional(),
  // Free text rather than a number. YNAB 4 accepts things that are not
  // numbers here, and the column is text, so only the length is this schema's
  // business. The per-account counter reads the ones that are numbers.
  checkNumber: z.string().max(20).nullable().optional(),
});

// `partial()` leaves the defaults on `cleared`/`accepted` intact in zod 4, so a
// partial update would fill them in and reset an already-reconciled transaction.
// Re-declare them as plain optionals so absent keys stay absent.
export const updateTransactionSchema = createTransactionSchema.partial().extend({
  id: z.number().int().positive(),
  cleared: z.enum(ASSIGNABLE_CLEARED_VALUES).optional(),
  accepted: z.boolean().optional(),
});

// ─── Scheduled Transaction ───────────────────────────────────────────────────

// `date` is the next occurrence rather than the day the schedule was made: it
// is the seed the whole series is measured from, and entering or skipping one
// occurrence moves it on to the next.
export const createScheduledTransactionSchema = z.object({
  accountId: z.number().int().positive(),
  payeeId: z.number().int().positive().nullable(),
  payeeName: z.string().min(1).optional(), // create payee on the fly
  categoryId: z.number().int().positive().nullable(),
  amount: z.number(), // positive = inflow, negative = outflow
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frequency: z.enum(FREQUENCY_VALUES),
  // Only TwiceAMonth reads this, and only the first day of the pair: the second
  // falls fifteen days later. Past the 15th the pair collapses towards the end
  // of the month, so a start day of 30 would mean two occurrences a day apart
  // in January and a single one in February.
  twiceMonthDay: z.number().int().min(1).max(15).nullable().optional(),
  memo: z.string().optional(),
});

// Nothing here carries a `default()`, so `partial()` is safe as it stands: the
// trap that makes `updateTransactionSchema` re-declare two fields is absent.
export const updateScheduledTransactionSchema = createScheduledTransactionSchema
  .partial()
  .extend({ id: z.number().int().positive() });

// ─── Monthly Budget ──────────────────────────────────────────────────────────

export const setBudgetedSchema = z.object({
  categoryId: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // always first of month
  budgeted: z.number(),
});

// ─── Account ─────────────────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  // The column is unbounded text, so the ceiling has to come from here.
  name: z.string().min(1).max(200),
  accountType: z.enum(ACCOUNT_TYPES),
  onBudget: z.boolean().default(true),
  // Bounded here for the same reason, and to the same ceiling the account
  // router puts on a note it is handed later.
  note: z.string().max(1000).optional(),
});

// What the user asserts about a statement: the balance printed on it and the
// date it closes. `adjustment` is their consent to write the difference off as
// a transaction, so a reconcile that does not balance is refused without it
// rather than quietly entering money nobody asked for.
export const reconcileAccountSchema = z.object({
  accountId: z.number().int().positive(),
  statementBalance: z.number(),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adjustment: z.boolean().default(false),
});

// ─── Category ────────────────────────────────────────────────────────────────

// All a category or a group of them is ever given is a name. The column is
// unbounded text, so the ceiling has to come from here, and it is the one an
// account's name already carries.
export const categoryNameSchema = z.string().min(1).max(200);

// ─── Budget search params (shared with router) ───────────────────────────────

export const budgetSearchSchema = z.object({
  // MM/YYYY format matching the YNAB4 convention shown in the URL
  month: z.string().regex(/^\d{2}\/\d{4}$/).optional(),
});

export const accountRegisterSearchSchema = z.object({
  cleared: z.enum(["all", ...CLEARED_VALUES]).default("all"),
  q: z.string().optional(),
  // A register is a chronological ledger first, so date ascending is what it
  // falls back to and what it returns to.
  sort: z.enum(REGISTER_SORTS).default("date"),
  dir: z.enum(SORT_DIRECTIONS).default("asc"),
});

export type CreateTransaction = z.infer<typeof createTransactionSchema>;
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;
export type CreateScheduledTransaction = z.infer<typeof createScheduledTransactionSchema>;
export type UpdateScheduledTransaction = z.infer<typeof updateScheduledTransactionSchema>;
export type SetBudgeted = z.infer<typeof setBudgetedSchema>;
export type CreateAccount = z.infer<typeof createAccountSchema>;
export type ReconcileAccount = z.infer<typeof reconcileAccountSchema>;

import { z } from "zod";
import {
  ACCOUNT_TYPES,
  ASSIGNABLE_CLEARED_VALUES,
  CLEARED_VALUES,
  FREQUENCY_VALUES,
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
  flagColor: z.string().optional(),
});

// `partial()` leaves the defaults on `cleared`/`accepted` intact in zod 4, so a
// partial update would fill them in and reset an already-reconciled transaction.
// Re-declare them as plain optionals so absent keys stay absent.
export const updateTransactionSchema = createTransactionSchema.partial().extend({
  id: z.number().int().positive(),
  cleared: z.enum(ASSIGNABLE_CLEARED_VALUES).optional(),
  accepted: z.boolean().optional(),
});

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
});

export type CreateTransaction = z.infer<typeof createTransactionSchema>;
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;
export type SetBudgeted = z.infer<typeof setBudgetedSchema>;
export type CreateAccount = z.infer<typeof createAccountSchema>;
export type ReconcileAccount = z.infer<typeof reconcileAccountSchema>;

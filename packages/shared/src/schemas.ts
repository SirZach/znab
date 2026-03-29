import { z } from "zod";
import { ACCOUNT_TYPES, CLEARED_VALUES, FREQUENCY_VALUES } from "./types";

// ─── Transaction ────────────────────────────────────────────────────────────

export const createTransactionSchema = z.object({
  accountId: z.number().int().positive(),
  payeeId: z.number().int().positive().nullable(),
  payeeName: z.string().min(1).optional(), // create payee on the fly
  categoryId: z.number().int().positive().nullable(),
  amount: z.number(), // positive = inflow, negative = outflow
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cleared: z.enum(CLEARED_VALUES).default("Uncleared"),
  accepted: z.boolean().default(true),
  memo: z.string().optional(),
  flagColor: z.string().optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial().extend({
  id: z.number().int().positive(),
});

// ─── Monthly Budget ──────────────────────────────────────────────────────────

export const setBudgetedSchema = z.object({
  categoryId: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // always first of month
  budgeted: z.number(),
});

// ─── Account ─────────────────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  name: z.string().min(1),
  accountType: z.enum(ACCOUNT_TYPES),
  onBudget: z.boolean().default(true),
  note: z.string().optional(),
});

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

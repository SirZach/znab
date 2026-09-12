import {
  pgTable, serial, text, timestamp, integer, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { budgets } from "./budgets";
import { payees } from "./payees";

// YNAB 4 calls these payeeStringCondition entities and nests them inside the
// payee they rename to. They are flattened into their own table here so an
// imported bank string can be matched without walking every payee.
export const payeeRenameRules = pgTable("payee_rename_rules", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").notNull(),
  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),
  // The payee an imported string matching this rule is renamed to
  payeeId: integer("payee_id")
    .notNull()
    .references(() => payees.id),
  // Is | Contains | StartsWith | EndsWith
  operator: text("operator").notNull(),
  operand: text("operand").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [unique().on(t.ynabId, t.budgetId)]);

export const payeeRenameRulesRelations = relations(payeeRenameRules, ({ one }) => ({
  budget: one(budgets, { fields: [payeeRenameRules.budgetId], references: [budgets.id] }),
  payee: one(payees, { fields: [payeeRenameRules.payeeId], references: [payees.id] }),
}));

export type PayeeRenameRule = typeof payeeRenameRules.$inferSelect;
export type NewPayeeRenameRule = typeof payeeRenameRules.$inferInsert;

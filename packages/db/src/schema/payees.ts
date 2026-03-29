import {
  pgTable, serial, text, timestamp, integer, boolean, numeric, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { budgets } from "./budgets";
import { accounts } from "./accounts";
import { categories } from "./categories";

export const payees = pgTable("payees", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").notNull(),
  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),
  name: text("name").notNull(),
  // Set for "Transfer : Account Name" payees
  targetAccountId: integer("target_account_id").references(() => accounts.id),
  autofillCategoryId: integer("autofill_category_id").references(() => categories.id),
  autofillAmount: numeric("autofill_amount", { precision: 12, scale: 2 }),
  autofillMemo: text("autofill_memo"),
  enabled: boolean("enabled").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [unique().on(t.ynabId, t.budgetId)]);

export const payeesRelations = relations(payees, ({ one }) => ({
  budget: one(budgets, { fields: [payees.budgetId], references: [budgets.id] }),
  targetAccount: one(accounts, { fields: [payees.targetAccountId], references: [accounts.id] }),
  autofillCategory: one(categories, { fields: [payees.autofillCategoryId], references: [categories.id] }),
}));

export type Payee = typeof payees.$inferSelect;
export type NewPayee = typeof payees.$inferInsert;

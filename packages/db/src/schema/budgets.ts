import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { accounts } from "./accounts";
import { categoryGroups } from "./categories";
import { payees } from "./payees";
import { monthlyBudgets } from "./monthly-budgets";
import { transactions } from "./transactions";
import { scheduledTransactions } from "./scheduled-transactions";

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  dateLocale: text("date_locale").notNull().default("en_US"),
  budgetType: text("budget_type").notNull().default("Personal"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const budgetsRelations = relations(budgets, ({ one, many }) => ({
  user: one(users, { fields: [budgets.userId], references: [users.id] }),
  accounts: many(accounts),
  categoryGroups: many(categoryGroups),
  payees: many(payees),
  monthlyBudgets: many(monthlyBudgets),
  transactions: many(transactions),
  scheduledTransactions: many(scheduledTransactions),
}));

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

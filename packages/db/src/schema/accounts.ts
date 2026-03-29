import {
  pgTable, serial, text, timestamp, integer, boolean, numeric, date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { budgets } from "./budgets";
import { transactions } from "./transactions";

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").unique().notNull(),
  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),
  name: text("name").notNull(),
  // Checking | Savings | CreditCard | Cash | OtherLiability | InvestmentAccount
  accountType: text("account_type").notNull(),
  onBudget: boolean("on_budget").notNull().default(true),
  hidden: boolean("hidden").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  lastReconciledBalance: numeric("last_reconciled_balance", { precision: 12, scale: 2 }),
  lastReconciledDate: date("last_reconciled_date"),
  lastEnteredCheckNum: integer("last_entered_check_num"),
  note: text("note"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  budget: one(budgets, { fields: [accounts.budgetId], references: [budgets.id] }),
  transactions: many(transactions),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

import {
  pgTable, serial, text, timestamp, integer, boolean, numeric, date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { budgets } from "./budgets";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { payees } from "./payees";

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").unique().notNull(),
  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  payeeId: integer("payee_id").references(() => payees.id),
  categoryId: integer("category_id").references(() => categories.id),
  // Raw YNAB category ID — preserved for special IDs like Category/__ImmediateIncome__
  categoryYnabId: text("category_ynab_id"),
  // positive = inflow, negative = outflow
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: date("date").notNull(),
  // Uncleared | Cleared | Reconciled
  cleared: text("cleared").notNull().default("Uncleared"),
  accepted: boolean("accepted").notNull().default(true),
  memo: text("memo"),
  flagColor: text("flag_color"),
  checkNumber: text("check_number"),
  isTransfer: boolean("is_transfer").notNull().default(false),
  transferAccountId: integer("transfer_account_id").references(() => accounts.id),
  // ynab_id of the paired transfer transaction
  transferTransactionId: text("transfer_transaction_id"),
  isSplit: boolean("is_split").notNull().default(false),
  dateFromSchedule: date("date_from_schedule"),
  importedPayee: text("imported_payee"),
  ynabImportId: text("ynab_import_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const subTransactions = pgTable("sub_transactions", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").unique().notNull(),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id),
  categoryId: integer("category_id").references(() => categories.id),
  categoryYnabId: text("category_ynab_id"),
  payeeId: integer("payee_id").references(() => payees.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  memo: text("memo"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  budget: one(budgets, { fields: [transactions.budgetId], references: [budgets.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  payee: one(payees, { fields: [transactions.payeeId], references: [payees.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  transferAccount: one(accounts, {
    fields: [transactions.transferAccountId],
    references: [accounts.id],
    relationName: "transferAccount",
  }),
  subTransactions: many(subTransactions),
}));

export const subTransactionsRelations = relations(subTransactions, ({ one }) => ({
  transaction: one(transactions, { fields: [subTransactions.transactionId], references: [transactions.id] }),
  category: one(categories, { fields: [subTransactions.categoryId], references: [categories.id] }),
  payee: one(payees, { fields: [subTransactions.payeeId], references: [payees.id] }),
}));

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type SubTransaction = typeof subTransactions.$inferSelect;
export type NewSubTransaction = typeof subTransactions.$inferInsert;

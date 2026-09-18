import {
  pgTable, serial, text, timestamp, integer, boolean, numeric, date, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { budgets } from "./budgets";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { payees } from "./payees";

export const scheduledTransactions = pgTable("scheduled_transactions", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").notNull(),
  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  payeeId: integer("payee_id").references(() => payees.id),
  categoryId: integer("category_id").references(() => categories.id),
  categoryYnabId: text("category_ynab_id"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  // Next scheduled occurrence
  date: date("date").notNull(),
  // Monthly | TwiceAMonth | Weekly | EveryOtherWeek | etc.
  frequency: text("frequency").notNull(),
  // For TwiceAMonth: start day (1-15)
  twiceMonthDay: integer("twice_month_day"),
  // The day of the month a month-stepping series means. Carried apart from
  // `date` because the date is written back every time an occurrence is
  // entered, and a date that landed in a short month was clamped on the way:
  // read the day off that and a schedule due on the 31st quietly becomes one
  // due on the 28th, for good.
  anchorDay: integer("anchor_day"),
  memo: text("memo"),
  cleared: text("cleared").default("Uncleared"),
  accepted: boolean("accepted").default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [unique().on(t.ynabId, t.budgetId)]);

export const scheduledTransactionsRelations = relations(scheduledTransactions, ({ one }) => ({
  budget: one(budgets, { fields: [scheduledTransactions.budgetId], references: [budgets.id] }),
  account: one(accounts, { fields: [scheduledTransactions.accountId], references: [accounts.id] }),
  payee: one(payees, { fields: [scheduledTransactions.payeeId], references: [payees.id] }),
  category: one(categories, { fields: [scheduledTransactions.categoryId], references: [categories.id] }),
}));

export type ScheduledTransaction = typeof scheduledTransactions.$inferSelect;
export type NewScheduledTransaction = typeof scheduledTransactions.$inferInsert;

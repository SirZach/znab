import {
  pgTable, serial, text, timestamp, integer, boolean, numeric, unique, check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { INCOME_CATEGORY_IDS, type IncomeCategoryId } from "@znab/shared";
import { oneOf } from "./checks";
import { budgets } from "./budgets";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { payeeRenameRules } from "./payee-rename-rules";

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
  // Income has no category row, so a payee that autofills income names it by
  // ynab id here instead, the way a transaction's category_ynab_id does.
  autofillIncome: text("autofill_income").$type<IncomeCategoryId>(),
  autofillAmount: numeric("autofill_amount", { precision: 12, scale: 2 }),
  autofillMemo: text("autofill_memo"),
  enabled: boolean("enabled").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.budgetId, t.ynabId),
  check("payees_autofill_income_check", oneOf(t.autofillIncome, INCOME_CATEGORY_IDS)),
  // One autofill category at most: a row and an income id together would
  // leave which one wins up to whoever reads them.
  check("payees_autofill_one_category_check", sql`${t.autofillCategoryId} IS NULL OR ${t.autofillIncome} IS NULL`),
]);

export const payeesRelations = relations(payees, ({ one, many }) => ({
  budget: one(budgets, { fields: [payees.budgetId], references: [budgets.id] }),
  targetAccount: one(accounts, { fields: [payees.targetAccountId], references: [accounts.id] }),
  autofillCategory: one(categories, { fields: [payees.autofillCategoryId], references: [categories.id] }),
  renameRules: many(payeeRenameRules),
}));

export type Payee = typeof payees.$inferSelect;
export type NewPayee = typeof payees.$inferInsert;

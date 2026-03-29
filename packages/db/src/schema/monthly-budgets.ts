import {
  pgTable, serial, text, timestamp, integer, numeric, date, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { budgets } from "./budgets";
import { categories } from "./categories";

export const monthlyBudgets = pgTable(
  "monthly_budgets",
  {
    id: serial("id").primaryKey(),
    // e.g. "MCB/2023-09/CATEGORY-UUID"
    ynabId: text("ynab_id").unique().notNull(),
    budgetId: integer("budget_id")
      .notNull()
      .references(() => budgets.id),
    categoryId: integer("category_id").references(() => categories.id),
    // Always first-of-month: 2023-09-01
    month: date("month").notNull(),
    budgeted: numeric("budgeted", { precision: 12, scale: 2 }).notNull().default("0"),
    // null | "Confined"
    overspendingHandling: text("overspending_handling"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.categoryId, t.month)]
);

export const monthlyBudgetsRelations = relations(monthlyBudgets, ({ one }) => ({
  budget: one(budgets, { fields: [monthlyBudgets.budgetId], references: [budgets.id] }),
  category: one(categories, { fields: [monthlyBudgets.categoryId], references: [categories.id] }),
}));

export type MonthlyBudget = typeof monthlyBudgets.$inferSelect;
export type NewMonthlyBudget = typeof monthlyBudgets.$inferInsert;

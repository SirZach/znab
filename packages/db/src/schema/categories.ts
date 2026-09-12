import {
  pgTable, serial, text, timestamp, integer, boolean, numeric, date, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { budgets } from "./budgets";
import { monthlyBudgets } from "./monthly-budgets";
import { transactions } from "./transactions";

export const categoryGroups = pgTable("category_groups", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").notNull(),
  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),
  name: text("name").notNull(),
  // OUTFLOW | INFLOW
  type: text("type").notNull().default("OUTFLOW"),
  // true for __Hidden__, __Income__, __Internal__, __PreYNABDebtMaster__
  isSystem: boolean("is_system").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [unique().on(t.ynabId, t.budgetId)]);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  ynabId: text("ynab_id").notNull(),
  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),
  groupId: integer("group_id")
    .notNull()
    .references(() => categoryGroups.id),
  name: text("name").notNull(),
  type: text("type").notNull().default("OUTFLOW"),
  cachedBalance: numeric("cached_balance", { precision: 12, scale: 2 }).default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  // YNAB 4 category goals, all null when a category has no goal set.
  // null | "TB" (Target Category Balance) | "TBD" (Target Balance by Date) | "MF" (Monthly Funding)
  goalType: text("goal_type"),
  goalTarget: numeric("goal_target", { precision: 12, scale: 2 }),
  // First of month, only meaningful for TBD.
  goalTargetMonth: date("goal_target_month"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [unique().on(t.ynabId, t.budgetId)]);

export const categoryGroupsRelations = relations(categoryGroups, ({ one, many }) => ({
  budget: one(budgets, { fields: [categoryGroups.budgetId], references: [budgets.id] }),
  categories: many(categories),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  budget: one(budgets, { fields: [categories.budgetId], references: [budgets.id] }),
  group: one(categoryGroups, { fields: [categories.groupId], references: [categoryGroups.id] }),
  monthlyBudgets: many(monthlyBudgets),
  transactions: many(transactions),
}));

export type CategoryGroup = typeof categoryGroups.$inferSelect;
export type NewCategoryGroup = typeof categoryGroups.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

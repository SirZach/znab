import { pgTable, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { budgets } from "./budgets";

// One row per user: which two of their budgets are split between the household,
// and how much of what is left over goes to savings.
export const householdSplitSettings = pgTable("household_split_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id),
  primaryBudgetId: integer("primary_budget_id").references(() => budgets.id),
  partnerBudgetId: integer("partner_budget_id").references(() => budgets.id),
  savingsPercent: numeric("savings_percent", { precision: 5, scale: 2 }).notNull().default("40"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type HouseholdSplitSettings = typeof householdSplitSettings.$inferSelect;
export type NewHouseholdSplitSettings = typeof householdSplitSettings.$inferInsert;

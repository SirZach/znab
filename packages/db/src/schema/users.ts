import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { budgets } from "./budgets";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  budgets: many(budgets),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

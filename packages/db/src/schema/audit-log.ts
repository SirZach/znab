import {
  pgTable, serial, text, timestamp, integer, jsonb, index, check,
} from "drizzle-orm/pg-core";
import { AUDIT_ACTIONS, oneOf } from "./checks";
import { budgets } from "./budgets";
import { users } from "./users";

// Every change znab makes to money, written in the same transaction as the
// change. `before` and `after` are the whole row as stored, so a bad edit can
// be put back by hand without restoring a dump. `entity_id` is not a foreign
// key: it names a row in whichever table `entity` says, and outlives it.
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  // transaction | monthly_budget | scheduled_transaction | account | category
  entity: text("entity").notNull(),
  entityId: integer("entity_id").notNull(),
  // create | update | delete
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // The history of one row
  index("audit_log_entity_idx").on(t.entity, t.entityId, t.createdAt),
  // Recent changes in a budget
  index("audit_log_budget_id_created_at_idx").on(t.budgetId, t.createdAt),
  check("audit_log_action_check", oneOf(t.action, AUDIT_ACTIONS)),
]);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

ALTER TABLE "accounts" DROP CONSTRAINT "accounts_ynab_id_budget_id_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_ynab_id_budget_id_unique";--> statement-breakpoint
ALTER TABLE "category_groups" DROP CONSTRAINT "category_groups_ynab_id_budget_id_unique";--> statement-breakpoint
ALTER TABLE "payees" DROP CONSTRAINT "payees_ynab_id_budget_id_unique";--> statement-breakpoint
ALTER TABLE "payee_rename_rules" DROP CONSTRAINT "payee_rename_rules_ynab_id_budget_id_unique";--> statement-breakpoint
ALTER TABLE "monthly_budgets" DROP CONSTRAINT "monthly_budgets_ynab_id_budget_id_unique";--> statement-breakpoint
ALTER TABLE "sub_transactions" DROP CONSTRAINT "sub_transactions_ynab_id_transaction_id_unique";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_ynab_id_budget_id_unique";--> statement-breakpoint
ALTER TABLE "scheduled_transactions" DROP CONSTRAINT "scheduled_transactions_ynab_id_budget_id_unique";--> statement-breakpoint
CREATE INDEX "transactions_account_id_date_idx" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_budget_id_date_idx" ON "transactions" USING btree ("budget_id","date");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_budget_id_ynab_id_unique" UNIQUE("budget_id","ynab_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_budget_id_ynab_id_unique" UNIQUE("budget_id","ynab_id");--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_budget_id_ynab_id_unique" UNIQUE("budget_id","ynab_id");--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_budget_id_ynab_id_unique" UNIQUE("budget_id","ynab_id");--> statement-breakpoint
ALTER TABLE "payee_rename_rules" ADD CONSTRAINT "payee_rename_rules_budget_id_ynab_id_unique" UNIQUE("budget_id","ynab_id");--> statement-breakpoint
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_budget_id_ynab_id_unique" UNIQUE("budget_id","ynab_id");--> statement-breakpoint
ALTER TABLE "sub_transactions" ADD CONSTRAINT "sub_transactions_transaction_id_ynab_id_unique" UNIQUE("transaction_id","ynab_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budget_id_ynab_id_unique" UNIQUE("budget_id","ynab_id");--> statement-breakpoint
ALTER TABLE "scheduled_transactions" ADD CONSTRAINT "scheduled_transactions_budget_id_ynab_id_unique" UNIQUE("budget_id","ynab_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_type_check" CHECK ("categories"."type" IN ('OUTFLOW', 'INFLOW'));--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_goal_type_check" CHECK ("categories"."goal_type" IN ('TB', 'TBD', 'MF'));--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_type_check" CHECK ("category_groups"."type" IN ('OUTFLOW', 'INFLOW'));--> statement-breakpoint
ALTER TABLE "payee_rename_rules" ADD CONSTRAINT "payee_rename_rules_operator_check" CHECK ("payee_rename_rules"."operator" IN ('Is', 'Contains', 'StartsWith', 'EndsWith'));--> statement-breakpoint
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_overspending_handling_check" CHECK ("monthly_budgets"."overspending_handling" IN ('Confined', 'AffectsBuffer'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cleared_check" CHECK ("transactions"."cleared" IN ('Uncleared', 'Cleared', 'Reconciled'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_flag_color_check" CHECK ("transactions"."flag_color" IN ('Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'));--> statement-breakpoint
ALTER TABLE "scheduled_transactions" ADD CONSTRAINT "scheduled_transactions_cleared_check" CHECK ("scheduled_transactions"."cleared" IN ('Uncleared', 'Cleared', 'Reconciled'));
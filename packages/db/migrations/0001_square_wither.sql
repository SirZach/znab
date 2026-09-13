ALTER TABLE "accounts" DROP CONSTRAINT "accounts_ynab_id_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_ynab_id_unique";--> statement-breakpoint
ALTER TABLE "category_groups" DROP CONSTRAINT "category_groups_ynab_id_unique";--> statement-breakpoint
ALTER TABLE "payees" DROP CONSTRAINT "payees_ynab_id_unique";--> statement-breakpoint
ALTER TABLE "monthly_budgets" DROP CONSTRAINT "monthly_budgets_ynab_id_unique";--> statement-breakpoint
ALTER TABLE "sub_transactions" DROP CONSTRAINT "sub_transactions_ynab_id_unique";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_ynab_id_unique";--> statement-breakpoint
ALTER TABLE "scheduled_transactions" DROP CONSTRAINT "scheduled_transactions_ynab_id_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_ynab_id_budget_id_unique" UNIQUE("ynab_id","budget_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_ynab_id_budget_id_unique" UNIQUE("ynab_id","budget_id");--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_ynab_id_budget_id_unique" UNIQUE("ynab_id","budget_id");--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_ynab_id_budget_id_unique" UNIQUE("ynab_id","budget_id");--> statement-breakpoint
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_ynab_id_budget_id_unique" UNIQUE("ynab_id","budget_id");--> statement-breakpoint
ALTER TABLE "sub_transactions" ADD CONSTRAINT "sub_transactions_ynab_id_transaction_id_unique" UNIQUE("ynab_id","transaction_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ynab_id_budget_id_unique" UNIQUE("ynab_id","budget_id");--> statement-breakpoint
ALTER TABLE "scheduled_transactions" ADD CONSTRAINT "scheduled_transactions_ynab_id_budget_id_unique" UNIQUE("ynab_id","budget_id");
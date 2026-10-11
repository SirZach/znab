ALTER TABLE "accounts" DROP COLUMN "last_entered_check_num";--> statement-breakpoint
ALTER TABLE "budgets" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "budgets" DROP COLUMN "date_locale";--> statement-breakpoint
ALTER TABLE "budgets" DROP COLUMN "budget_type";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "cached_balance";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "check_number";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "imported_payee";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "ynab_import_id";
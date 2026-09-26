CREATE TABLE "household_split_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"primary_budget_id" integer,
	"partner_budget_id" integer,
	"savings_percent" numeric(5, 2) DEFAULT '40' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "category_groups" ADD COLUMN "in_master_budgets" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "household_split_settings" ADD CONSTRAINT "household_split_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_split_settings" ADD CONSTRAINT "household_split_settings_primary_budget_id_budgets_id_fk" FOREIGN KEY ("primary_budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_split_settings" ADD CONSTRAINT "household_split_settings_partner_budget_id_budgets_id_fk" FOREIGN KEY ("partner_budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;
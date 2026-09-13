CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"date_locale" text DEFAULT 'en_US' NOT NULL,
	"budget_type" text DEFAULT 'Personal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "budgets_ynab_id_unique" UNIQUE("ynab_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"budget_id" integer NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"on_budget" boolean DEFAULT true NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"last_reconciled_balance" numeric(12, 2),
	"last_reconciled_date" date,
	"last_entered_check_num" integer,
	"note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "accounts_ynab_id_unique" UNIQUE("ynab_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"budget_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'OUTFLOW' NOT NULL,
	"cached_balance" numeric(12, 2) DEFAULT '0',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "categories_ynab_id_unique" UNIQUE("ynab_id")
);
--> statement-breakpoint
CREATE TABLE "category_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"budget_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'OUTFLOW' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "category_groups_ynab_id_unique" UNIQUE("ynab_id")
);
--> statement-breakpoint
CREATE TABLE "payees" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"budget_id" integer NOT NULL,
	"name" text NOT NULL,
	"target_account_id" integer,
	"autofill_category_id" integer,
	"autofill_amount" numeric(12, 2),
	"autofill_memo" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "payees_ynab_id_unique" UNIQUE("ynab_id")
);
--> statement-breakpoint
CREATE TABLE "monthly_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"budget_id" integer NOT NULL,
	"category_id" integer,
	"month" date NOT NULL,
	"budgeted" numeric(12, 2) DEFAULT '0' NOT NULL,
	"overspending_handling" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "monthly_budgets_ynab_id_unique" UNIQUE("ynab_id"),
	CONSTRAINT "monthly_budgets_category_id_month_unique" UNIQUE("category_id","month")
);
--> statement-breakpoint
CREATE TABLE "sub_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"transaction_id" integer NOT NULL,
	"category_id" integer,
	"category_ynab_id" text,
	"payee_id" integer,
	"amount" numeric(12, 2) NOT NULL,
	"memo" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sub_transactions_ynab_id_unique" UNIQUE("ynab_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"budget_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"payee_id" integer,
	"category_id" integer,
	"category_ynab_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"cleared" text DEFAULT 'Uncleared' NOT NULL,
	"accepted" boolean DEFAULT true NOT NULL,
	"memo" text,
	"flag_color" text,
	"check_number" text,
	"is_transfer" boolean DEFAULT false NOT NULL,
	"transfer_account_id" integer,
	"transfer_transaction_id" text,
	"is_split" boolean DEFAULT false NOT NULL,
	"date_from_schedule" date,
	"imported_payee" text,
	"ynab_import_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "transactions_ynab_id_unique" UNIQUE("ynab_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"budget_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"payee_id" integer,
	"category_id" integer,
	"category_ynab_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"frequency" text NOT NULL,
	"twice_month_day" integer,
	"memo" text,
	"cleared" text DEFAULT 'Uncleared',
	"accepted" boolean DEFAULT true,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "scheduled_transactions_ynab_id_unique" UNIQUE("ynab_id")
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_category_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."category_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_autofill_category_id_categories_id_fk" FOREIGN KEY ("autofill_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_transactions" ADD CONSTRAINT "sub_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_transactions" ADD CONSTRAINT "sub_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_transactions" ADD CONSTRAINT "sub_transactions_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_account_id_accounts_id_fk" FOREIGN KEY ("transfer_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transactions" ADD CONSTRAINT "scheduled_transactions_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transactions" ADD CONSTRAINT "scheduled_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transactions" ADD CONSTRAINT "scheduled_transactions_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_transactions" ADD CONSTRAINT "scheduled_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
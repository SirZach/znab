CREATE TABLE "payee_rename_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"ynab_id" text NOT NULL,
	"budget_id" integer NOT NULL,
	"payee_id" integer NOT NULL,
	"operator" text NOT NULL,
	"operand" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "payee_rename_rules_ynab_id_budget_id_unique" UNIQUE("ynab_id","budget_id")
);
--> statement-breakpoint
ALTER TABLE "payee_rename_rules" ADD CONSTRAINT "payee_rename_rules_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee_rename_rules" ADD CONSTRAINT "payee_rename_rules_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;
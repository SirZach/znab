ALTER TABLE "categories" ADD COLUMN "goal_type" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "goal_target" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "goal_target_month" date;

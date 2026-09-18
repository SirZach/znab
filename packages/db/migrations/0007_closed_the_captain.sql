ALTER TABLE "scheduled_transactions" ADD COLUMN "anchor_day" integer;--> statement-breakpoint
-- The day of the month a month-stepping schedule means, which until now was
-- only ever read off `date`. That works exactly once: entering an occurrence
-- writes the next one back, and a date that landed in a short month was
-- clamped on the way, so the following read takes the clamped day as the one
-- the schedule meant. A bill due on the 31st becomes one due on the 28th the
-- first time it crosses February, and stays there.
--
-- Backfilling from `date` is correct for every row that exists: nothing in the
-- app has ever advanced one of these, so no stored date has been clamped yet.
-- Each still carries the day it was imported with, which is the day it means.
UPDATE "scheduled_transactions"
SET "anchor_day" = EXTRACT(DAY FROM "date")::integer
WHERE "anchor_day" IS NULL;

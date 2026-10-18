CREATE INDEX "transactions_payee_id_idx" ON "transactions" USING btree ("payee_id");--> statement-breakpoint
CREATE INDEX "transactions_category_id_idx" ON "transactions" USING btree ("category_id");
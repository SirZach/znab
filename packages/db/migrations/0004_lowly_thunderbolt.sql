-- Every YNAB 4 account carries a payee that stands in for it, so that money can
-- be moved to the account from somewhere else. The imported budgets have one per
-- account, enabled exactly when the account is still open, without exception. A
-- budget seeded here has none at all, which leaves its accounts unreachable as a
-- transfer target, since a transfer is declared by choosing that payee. Mint the
-- missing ones on the same rule.
INSERT INTO "payees" ("ynab_id", "budget_id", "name", "target_account_id", "enabled")
SELECT
	'Payee/Transfer:' || "accounts"."ynab_id",
	"accounts"."budget_id",
	'Transfer : ' || "accounts"."name",
	"accounts"."id",
	NOT "accounts"."hidden"
FROM "accounts"
WHERE "accounts"."deleted_at" IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM "payees"
		WHERE "payees"."budget_id" = "accounts"."budget_id"
			AND "payees"."target_account_id" = "accounts"."id"
	)
ON CONFLICT ("ynab_id", "budget_id") DO NOTHING;

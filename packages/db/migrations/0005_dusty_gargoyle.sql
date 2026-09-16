-- YNAB 4's sortableIndex is a binary-subdivision key spread across the whole
-- int32 range, and the importer clamped everything above a million to 9999, so
-- every budget now holds exactly two distinct sort orders and the sidebar's
-- ordering means nothing. Rank each budget's live accounts densely from 0,
-- ordered by what is stored now and then by name, which is deterministic and
-- leaves the one meaningful value, the account already sitting at 0, where it
-- is. Only the accounts that actually move are written.
UPDATE "accounts" SET "sort_order" = "ranked"."ord", "updated_at" = now()
FROM (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "budget_id" ORDER BY "sort_order", "name", "id"
		) - 1 AS "ord"
	FROM "accounts"
	WHERE "deleted_at" IS NULL
) AS "ranked"
WHERE "accounts"."id" = "ranked"."id"
	AND "accounts"."sort_order" <> "ranked"."ord";

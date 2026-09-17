-- Two different ordering repairs, which is why they read differently.
--
-- Categories kept YNAB 4's own key, so their order within a group is real and
-- must survive. Ranking by what is already stored is therefore lossless: it
-- only closes the gaps. It has to happen because that key runs to within a few
-- thousand of the int4 ceiling, so a category added at one past the maximum
-- would overflow the column.
--
-- Hidden categories are renumbered along with the rest, deliberately. A hidden
-- one is a live row the user can unhide, so it keeps its place in the group's
-- order, and the end of a group is measured over every category in it for
-- exactly that reason. Leaving them out would strand 35 of them on the old
-- scale, one at 2147418111, and the next category filed into that group would
-- land one past it: back at the ceiling this migration exists to move away
-- from, on the first write rather than eventually.
UPDATE "categories" SET "sort_order" = "ranked"."ord", "updated_at" = now()
FROM (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "group_id" ORDER BY "sort_order", "name", "id"
		) - 1 AS "ord"
	FROM "categories"
) AS "ranked"
WHERE "categories"."id" = "ranked"."id"
	AND "categories"."sort_order" <> "ranked"."ord";
--> statement-breakpoint
-- Groups never had an order stored at all: the importer read no sortableIndex
-- and every group in every budget sat on the column default, so the order shown
-- was whatever the database felt like. There is nothing to preserve, and the
-- real order is in the export rather than in here, so this settles on names.
-- System groups are parked from 9000 so that reordering the user's own groups,
-- which writes 0 upwards, can never interleave with them.
UPDATE "category_groups" SET "sort_order" = "ranked"."ord", "updated_at" = now()
FROM (
	SELECT
		"id",
		CASE WHEN "is_system" THEN 9000 ELSE 0 END + ROW_NUMBER() OVER (
			PARTITION BY "budget_id", "is_system" ORDER BY "name", "id"
		) - 1 AS "ord"
	FROM "category_groups"
	WHERE "deleted_at" IS NULL
) AS "ranked"
WHERE "category_groups"."id" = "ranked"."id"
	AND "category_groups"."sort_order" <> "ranked"."ord";

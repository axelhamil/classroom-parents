ALTER TABLE "child_account" ADD COLUMN "color" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "child_account" SET "color" = "ranked"."color" FROM (SELECT "id", ((row_number() OVER (PARTITION BY "user_id" ORDER BY "connected_at", "id") - 1) % 8) + 1 AS "color" FROM "child_account") AS "ranked" WHERE "child_account"."id" = "ranked"."id";--> statement-breakpoint
ALTER TABLE "child_account" ALTER COLUMN "color" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "child_account" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "child_account" ADD CONSTRAINT "child_account_color_hue" CHECK ("child_account"."color" BETWEEN 1 AND 8);

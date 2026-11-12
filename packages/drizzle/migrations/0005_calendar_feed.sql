CREATE TABLE "calendar_feed" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"secret_hash" text NOT NULL,
	"child_ids" uuid[],
	"created_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"last_fetched_at" timestamp with time zone,
	CONSTRAINT "calendar_feed_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "calendar_feed_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
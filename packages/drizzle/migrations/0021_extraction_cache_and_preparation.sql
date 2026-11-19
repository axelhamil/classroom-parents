CREATE TABLE "extraction_result" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"announcement_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"published_on" date NOT NULL,
	"time_zone" text NOT NULL,
	"prompt_version" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_result_content_hash_sha256" CHECK ("extraction_result"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "extraction_result_prompt_version_slug" CHECK ("extraction_result"."prompt_version" ~ '^[a-z0-9][a-z0-9.-]{0,47}$')
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "parent_actions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "to_bring" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_result_key" ON "extraction_result" USING btree ("content_hash","published_on","time_zone","prompt_version","announcement_id");--> statement-breakpoint
CREATE INDEX "extraction_result_last_read_idx" ON "extraction_result" USING btree ("last_read_at");
ALTER TABLE "event" ADD COLUMN "review_reasons" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "evidence_quote" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "amend_reason" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "confirmed_by_parent_at" timestamp with time zone;
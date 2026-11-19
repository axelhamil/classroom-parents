ALTER TABLE "event" ADD COLUMN "evidence_start" integer;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "evidence_end" integer;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "evidence_before" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "evidence_after" text DEFAULT '' NOT NULL;
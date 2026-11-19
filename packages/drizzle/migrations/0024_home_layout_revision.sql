ALTER TABLE "home_layout" ALTER COLUMN "blocks" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "home_layout" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;
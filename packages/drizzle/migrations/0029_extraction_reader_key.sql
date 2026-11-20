DROP INDEX "extraction_result_key";--> statement-breakpoint
ALTER TABLE "extraction_result" ADD COLUMN "output_locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "extraction_result" ADD COLUMN "date_order" text DEFAULT 'day-month' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_result_key" ON "extraction_result" USING btree ("content_hash","published_on","time_zone","prompt_version","output_locale","date_order","announcement_id");--> statement-breakpoint
ALTER TABLE "extraction_result" ADD CONSTRAINT "extraction_result_output_locale" CHECK ("extraction_result"."output_locale" in ('fr', 'en', 'es', 'pt', 'ar'));--> statement-breakpoint
ALTER TABLE "extraction_result" ADD CONSTRAINT "extraction_result_date_order" CHECK ("extraction_result"."date_order" in ('day-month', 'month-day', 'unknown'));
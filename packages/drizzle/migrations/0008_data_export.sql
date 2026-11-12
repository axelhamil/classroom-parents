ALTER TABLE "user" ADD COLUMN "last_data_export_at" timestamp;--> statement-breakpoint
CREATE INDEX "alert_event_reminders_user_idx" ON "alert_event_reminders" USING btree ("user_id");
ALTER TABLE "push_subscription" ADD COLUMN "session_id" text;--> statement-breakpoint
CREATE INDEX "push_subscription_session_idx" ON "push_subscription" USING btree ("session_id");
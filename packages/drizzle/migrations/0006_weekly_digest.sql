CREATE TABLE "alert_digest_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_weekly_digest" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"channel" text,
	"sent_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_weekly_digest_week_user_key" UNIQUE("week_start","user_id")
);
--> statement-breakpoint
ALTER TABLE "alert_digest_preference" ADD CONSTRAINT "alert_digest_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_weekly_digest" ADD CONSTRAINT "alert_weekly_digest_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_weekly_digest_pending_idx" ON "alert_weekly_digest" USING btree ("created_at") WHERE "alert_weekly_digest"."status" = 'pending';
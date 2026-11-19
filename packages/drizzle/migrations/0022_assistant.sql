CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"month" date NOT NULL,
	"feature" text NOT NULL,
	"calls" integer NOT NULL,
	"escalations" integer NOT NULL,
	"cost_micro_usd" integer NOT NULL,
	CONSTRAINT "ai_usage_family_month_feature" UNIQUE("user_id","month","feature"),
	CONSTRAINT "ai_usage_month_first_day" CHECK (extract(day from "ai_usage"."month") = 1),
	CONSTRAINT "ai_usage_counts_positive" CHECK ("ai_usage"."calls" >= 0 and "ai_usage"."escalations" between 0 and "ai_usage"."calls" and "ai_usage"."cost_micro_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_usage_alert" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"user_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_alert_once" UNIQUE NULLS NOT DISTINCT("kind","period","user_id")
);
--> statement-breakpoint
CREATE TABLE "assistant_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"locale" text,
	"time_zone" text,
	"country" text,
	"extraction_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_alert" ADD CONSTRAINT "ai_usage_alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_preference" ADD CONSTRAINT "assistant_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_month_idx" ON "ai_usage" USING btree ("month");--> statement-breakpoint
CREATE INDEX "ai_usage_alert_sent_idx" ON "ai_usage_alert" USING btree ("sent_at");
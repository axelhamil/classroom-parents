CREATE TABLE "school_calendar_choice" (
	"user_id" text PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"region" text,
	"school_holidays" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_holiday_period" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"origin" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
INSERT INTO "school_calendar_choice" ("user_id", "country", "region", "school_holidays", "updated_at")
SELECT "user_id", 'FR', "zone", 'official', "updated_at" FROM "school_zone_preference";--> statement-breakpoint
DELETE FROM "school_calendar_cache";--> statement-breakpoint
DROP TABLE "school_zone_preference" CASCADE;--> statement-breakpoint
ALTER TABLE "school_calendar_choice" ADD CONSTRAINT "school_calendar_choice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_holiday_period" ADD CONSTRAINT "school_holiday_period_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_holiday_period_user_start_idx" ON "school_holiday_period" USING btree ("user_id","starts_on");
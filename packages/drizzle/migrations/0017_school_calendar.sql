CREATE TABLE "school_calendar_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"entries" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_zone_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"zone" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_zone_preference" ADD CONSTRAINT "school_zone_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
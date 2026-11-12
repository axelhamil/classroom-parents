CREATE TABLE "alert_quiet_hours" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_quiet_hours" ADD CONSTRAINT "alert_quiet_hours_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "push_lock_screen" (
	"user_id" text PRIMARY KEY NOT NULL,
	"details" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_lock_screen" ADD CONSTRAINT "push_lock_screen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "alert_access_loss" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"child_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"channel" text,
	"sent_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alert_access_loss" ADD CONSTRAINT "alert_access_loss_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_access_loss" ADD CONSTRAINT "alert_access_loss_child_id_child_account_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_access_loss_open_child_key" ON "alert_access_loss" USING btree ("child_id") WHERE "alert_access_loss"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "alert_access_loss_child_idx" ON "alert_access_loss" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "alert_access_loss_user_idx" ON "alert_access_loss" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alert_access_loss_pending_due_idx" ON "alert_access_loss" USING btree ("due_at") WHERE "alert_access_loss"."status" = 'pending';
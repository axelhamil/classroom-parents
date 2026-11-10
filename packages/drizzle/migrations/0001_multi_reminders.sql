CREATE TABLE "alert_default_reminders" (
	"user_id" text PRIMARY KEY NOT NULL,
	"reminders" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE TABLE "alert_event_reminders" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reminders" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
ALTER TABLE "alert" DROP CONSTRAINT "alert_event_id_unique";--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "reminder" text DEFAULT 'd2@18:00' NOT NULL;--> statement-breakpoint
UPDATE "alert" SET "origin" = "legacy"."origin", "reminder" = "legacy"."reminder", "due_at" = "legacy"."due_at", "version" = "alert"."version" + CASE WHEN "alert"."status" = 'pending' AND "legacy"."due_at" <> "alert"."due_at" THEN 1 ELSE 0 END FROM (SELECT "id", CASE WHEN "own" THEN 'user' ELSE 'default' END AS "origin", CASE WHEN "own" THEN 'd' || LEAST("days", 14) || '@' || "wall_time" ELSE 'd2@18:00' END AS "reminder", CASE WHEN NOT "own" THEN (("deadline_day" - 2) + time '18:00') AT TIME ZONE 'Europe/Paris' WHEN "days" > 14 THEN (("deadline_day" - 14) + "wall_time"::time) AT TIME ZONE 'Europe/Paris' ELSE "due_at" END AS "due_at" FROM (SELECT "id", "due_at", "due_at" < "deadline_at" AS "own", ("deadline_at" AT TIME ZONE 'Europe/Paris')::date AS "deadline_day", ("deadline_at" AT TIME ZONE 'Europe/Paris')::date - ("due_at" AT TIME ZONE 'Europe/Paris')::date AS "days", to_char("due_at" AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS "wall_time" FROM "alert" WHERE "origin" = 'user') AS "wall") AS "legacy" WHERE "alert"."id" = "legacy"."id";--> statement-breakpoint
ALTER TABLE "alert" ALTER COLUMN "reminder" DROP DEFAULT;--> statement-breakpoint
INSERT INTO "alert_event_reminders" ("event_id", "user_id", "reminders", "updated_at") SELECT "event_id", "user_id", jsonb_build_array(jsonb_build_object('kind', 'days_before', 'days', ("deadline_at" AT TIME ZONE 'Europe/Paris')::date - ("due_at" AT TIME ZONE 'Europe/Paris')::date, 'time', to_char("due_at" AT TIME ZONE 'Europe/Paris', 'HH24:MI'))), now() FROM "alert" WHERE "origin" = 'user';--> statement-breakpoint
ALTER TABLE "alert_default_reminders" ADD CONSTRAINT "alert_default_reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_event_reminders" ADD CONSTRAINT "alert_event_reminders_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_event_reminders" ADD CONSTRAINT "alert_event_reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_event_reminder_key" UNIQUE("event_id","reminder");--> statement-breakpoint
CREATE INDEX "alert_user_idx" ON "alert" USING btree ("user_id");

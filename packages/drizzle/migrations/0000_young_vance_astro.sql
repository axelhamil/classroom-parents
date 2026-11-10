CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"pending_deletion_until" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_message" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"template" text,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"locale" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"sent_at" timestamp,
	"last_error" text,
	"provider_message_id" text,
	"idempotency_key" text,
	"batch_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"dispatched_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp,
	"dead_at" timestamp,
	"deliveries" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "outbox_event_deliveries_object" CHECK (jsonb_typeof("outbox_event"."deliveries") = 'object')
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"points" integer NOT NULL,
	"expire" timestamp
);
--> statement-breakpoint
CREATE TABLE "sweep_lock" (
	"label" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sweep_run" (
	"label" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"child_id" uuid NOT NULL,
	"source" text DEFAULT 'announcement' NOT NULL,
	"announcement_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"course_id" text NOT NULL,
	"announcement_url" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"deadline_date" date NOT NULL,
	"deadline_time" time,
	"deadline_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp with time zone,
	"edited_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"deleted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_child_source_item_key" UNIQUE("child_id","source","announcement_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "alert_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "alert_delivery" (
	"alert_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"outcome" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "alert_delivery_alert_channel_key" UNIQUE("alert_id","channel")
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "child_account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"linked_account_id" text NOT NULL,
	"google_email" text NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"cause" text,
	"connected_at" timestamp NOT NULL,
	"last_synced_at" timestamp,
	"next_sync_at" timestamp NOT NULL,
	"sync_started_at" timestamp,
	"sync_attempts" integer DEFAULT 0 NOT NULL,
	"sync_lease" integer DEFAULT 0 NOT NULL,
	"last_sync_requested_at" timestamp,
	CONSTRAINT "child_account_linked_account_id_unique" UNIQUE("linked_account_id")
);
--> statement-breakpoint
CREATE TABLE "seen_announcement" (
	"child_id" uuid NOT NULL,
	"announcement_id" text NOT NULL,
	"course_id" text NOT NULL,
	"outcome" text NOT NULL,
	"attempts" integer NOT NULL,
	"seen_at" timestamp NOT NULL,
	CONSTRAINT "seen_announcement_child_id_announcement_id_pk" PRIMARY KEY("child_id","announcement_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_child_id_child_account_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_delivery" ADD CONSTRAINT "alert_delivery_alert_id_alert_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alert"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_account" ADD CONSTRAINT "child_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_account" ADD CONSTRAINT "child_account_linked_account_id_account_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_announcement" ADD CONSTRAINT "seen_announcement_child_id_child_account_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "email_message_idempotency_uidx" ON "email_message" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_message_to_address_idx" ON "email_message" USING btree ("to_address");--> statement-breakpoint
CREATE INDEX "email_message_pending_idx" ON "email_message" USING btree ("next_attempt_at","created_at") WHERE "email_message"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "email_message_pending_created_idx" ON "email_message" USING btree ("created_at") WHERE "email_message"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "email_message_sweep_idx" ON "email_message" USING btree ("sent_at") WHERE "email_message"."status" = 'sent';--> statement-breakpoint
CREATE INDEX "email_message_dead_retry_idx" ON "email_message" USING btree ("next_attempt_at") WHERE "email_message"."status" = 'dead';--> statement-breakpoint
CREATE INDEX "email_message_batch_idx" ON "email_message" USING btree ("batch_key") WHERE "email_message"."status" in ('pending', 'dead');--> statement-breakpoint
CREATE INDEX "email_message_failed_sweep_idx" ON "email_message" USING btree ("created_at") WHERE "email_message"."status" in ('failed', 'dead');--> statement-breakpoint
CREATE INDEX "outbox_event_pending_idx" ON "outbox_event" USING btree ("occurred_at","id") WHERE "outbox_event"."dispatched_at" is null and "outbox_event"."dead_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_event_dead_retry_idx" ON "outbox_event" USING btree ("next_attempt_at") WHERE "outbox_event"."dispatched_at" is null and "outbox_event"."dead_at" is not null;--> statement-breakpoint
CREATE INDEX "outbox_event_dispatched_idx" ON "outbox_event" USING btree ("dispatched_at") WHERE "outbox_event"."dispatched_at" is not null;--> statement-breakpoint
CREATE INDEX "outbox_event_type_idx" ON "outbox_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "outbox_event_aggregate_idx" ON "outbox_event" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_event_payload_user_idx" ON "outbox_event" USING btree (("payload"->>'userId')) WHERE "outbox_event"."payload"->>'userId' is not null;--> statement-breakpoint
CREATE INDEX "outbox_event_payload_actor_idx" ON "outbox_event" USING btree (("payload"->>'actorUserId')) WHERE "outbox_event"."payload"->>'actorUserId' is not null;--> statement-breakpoint
CREATE INDEX "rate_limit_expire_idx" ON "rate_limit" USING btree ("expire") WHERE "rate_limit"."expire" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "event_coursework_day_idx" ON "event" USING btree ("child_id","course_id","deadline_date") WHERE "event"."source" = 'coursework' and "event"."deleted_at" is null and "event"."withdrawn_at" is null;--> statement-breakpoint
CREATE INDEX "event_user_deadline_idx" ON "event" USING btree ("user_id","deadline_at");--> statement-breakpoint
CREATE INDEX "alert_pending_due_idx" ON "alert" USING btree ("due_at") WHERE "alert"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "push_subscription_user_idx" ON "push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "child_account_user_idx" ON "child_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "child_account_due_idx" ON "child_account" USING btree ("next_sync_at") WHERE "child_account"."status" = 'connected';--> statement-breakpoint
CREATE INDEX "child_account_disconnecting_idx" ON "child_account" USING btree ("next_sync_at") WHERE "child_account"."status" = 'disconnecting';
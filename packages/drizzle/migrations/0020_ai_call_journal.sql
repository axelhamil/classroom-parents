CREATE TABLE "ai_call" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"cost_micro_usd" integer NOT NULL,
	"outcome" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_call_input_hash_sha256" CHECK ("ai_call"."input_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_call_prompt_version_slug" CHECK ("ai_call"."prompt_version" ~ '^[a-z0-9][a-z0-9.-]{0,47}$')
);
--> statement-breakpoint
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_user_created_idx" ON "ai_call" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_call_created_idx" ON "ai_call" USING btree ("created_at");
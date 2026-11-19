CREATE TABLE "classroom_course" (
	"child_id" uuid NOT NULL,
	"course_id" text NOT NULL,
	"name" text NOT NULL,
	"listed_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "classroom_course_child_id_course_id_pk" PRIMARY KEY("child_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "classroom_course" ADD CONSTRAINT "classroom_course_child_id_child_account_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_account"("id") ON DELETE cascade ON UPDATE no action;
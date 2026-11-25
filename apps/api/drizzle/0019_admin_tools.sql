CREATE TABLE "deleted_users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"friend_code" text NOT NULL,
	"deleted_by" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deleted_users" ADD CONSTRAINT "deleted_users_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deleted_users_deleted_idx" ON "deleted_users" USING btree ("deleted_at");
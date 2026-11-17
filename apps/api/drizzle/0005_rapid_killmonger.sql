ALTER TABLE "users" ADD COLUMN "reset_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_expires_at" timestamp with time zone;
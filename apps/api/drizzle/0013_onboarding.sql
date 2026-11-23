ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Accounts that existed before the welcome tour do not get it.
UPDATE "users" SET "onboarded_at" = "created_at";

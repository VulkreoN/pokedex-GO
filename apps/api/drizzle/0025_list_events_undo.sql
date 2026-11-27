ALTER TABLE "list_events" ADD COLUMN IF NOT EXISTS "undone_at" timestamp with time zone;
ALTER TABLE "list_events" ADD COLUMN IF NOT EXISTS "undo_payload" jsonb;

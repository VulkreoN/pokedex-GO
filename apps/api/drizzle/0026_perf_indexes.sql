CREATE INDEX IF NOT EXISTS "list_entries_variant_key_idx" ON "list_entries" USING btree ("variant_key");
CREATE INDEX IF NOT EXISTS "list_events_list_id_idx" ON "list_events" USING btree ("list_id", "id" DESC);

ALTER TABLE "list_entries" ADD COLUMN "tag" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "list_entries" DROP CONSTRAINT "list_entries_list_id_variant_key_shiny_pk";--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_list_id_variant_key_shiny_tag_pk" PRIMARY KEY("list_id","variant_key","shiny","tag");

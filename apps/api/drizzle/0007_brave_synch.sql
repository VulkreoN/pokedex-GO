CREATE TABLE "list_unfollows" (
	"user_id" text NOT NULL,
	"list_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_unfollows_user_id_list_id_pk" PRIMARY KEY("user_id","list_id")
);
--> statement-breakpoint
ALTER TABLE "list_offers" DROP CONSTRAINT "list_offers_list_id_variant_key_shiny_tag_list_entries_list_id_variant_key_shiny_tag_fk";
--> statement-breakpoint
ALTER TABLE "list_entries" DROP CONSTRAINT "list_entries_list_id_variant_key_shiny_tag_pk";
--> statement-breakpoint
ALTER TABLE "list_offers" DROP CONSTRAINT "list_offers_list_id_variant_key_shiny_tag_user_id_pk";
--> statement-breakpoint
ALTER TABLE "list_entries" ADD COLUMN "gender" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "list_offers" ADD COLUMN "gender" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_list_id_variant_key_shiny_tag_gender_pk" PRIMARY KEY("list_id","variant_key","shiny","tag","gender");
--> statement-breakpoint
ALTER TABLE "list_offers" ADD CONSTRAINT "list_offers_list_id_variant_key_shiny_tag_gender_user_id_pk" PRIMARY KEY("list_id","variant_key","shiny","tag","gender","user_id");
--> statement-breakpoint
ALTER TABLE "list_unfollows" ADD CONSTRAINT "list_unfollows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "list_unfollows" ADD CONSTRAINT "list_unfollows_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "list_offers" ADD CONSTRAINT "list_offers_list_id_variant_key_shiny_tag_gender_list_entries_list_id_variant_key_shiny_tag_gender_fk" FOREIGN KEY ("list_id","variant_key","shiny","tag","gender") REFERENCES "public"."list_entries"("list_id","variant_key","shiny","tag","gender") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
-- "Anyone with the link" is no longer a visibility: such lists become visible to friends (their share link keeps working).
UPDATE "lists" SET "visibility" = 'friends' WHERE "visibility" = 'link';

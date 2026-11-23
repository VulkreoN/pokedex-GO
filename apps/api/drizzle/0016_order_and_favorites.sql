CREATE TABLE "list_favorites" (
	"user_id" text NOT NULL,
	"list_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_favorites_user_id_list_id_pk" PRIMARY KEY("user_id","list_id")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "list_favorites" ADD CONSTRAINT "list_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_favorites" ADD CONSTRAINT "list_favorites_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Existing collections keep the order they were shown in: most recently changed first.
UPDATE "lists" SET "position" = r.n FROM (SELECT "id", row_number() OVER (PARTITION BY "owner_id" ORDER BY "updated_at" DESC) AS n FROM "lists") r WHERE r."id" = "lists"."id";

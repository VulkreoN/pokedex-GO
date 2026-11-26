ALTER TABLE "friendships" ADD COLUMN "lucky" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "pvp_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"league" text NOT NULL,
	"members" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pvp_teams" ADD CONSTRAINT "pvp_teams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pvp_teams_user_idx" ON "pvp_teams" USING btree ("user_id");

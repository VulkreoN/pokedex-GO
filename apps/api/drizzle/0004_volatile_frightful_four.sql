CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"author" text NOT NULL,
	"author_url" text,
	"text" text NOT NULL,
	"html" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"posted_at" timestamp with time zone,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_posted_idx" ON "posts" USING btree ("posted_at");
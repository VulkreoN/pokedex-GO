CREATE TABLE "feed_cursors" (
	"source" text PRIMARY KEY NOT NULL,
	"cursor" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text,
	"content" text DEFAULT '' NOT NULL,
	"url" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_by" text,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_items_status_idx" ON "feed_items" USING btree ("status","posted_at");--> statement-breakpoint
CREATE INDEX "feed_items_source_idx" ON "feed_items" USING btree ("source","posted_at");
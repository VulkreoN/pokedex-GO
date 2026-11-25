CREATE TABLE "deleted_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"entries" integer DEFAULT 0 NOT NULL,
	"deleted_by" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_lists" ADD CONSTRAINT "deleted_lists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_lists" ADD CONSTRAINT "deleted_lists_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deleted_lists_owner_idx" ON "deleted_lists" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "deleted_lists_deleted_idx" ON "deleted_lists" USING btree ("deleted_at");
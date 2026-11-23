CREATE TABLE "list_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "list_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"list_id" text NOT NULL,
	"actor_id" text,
	"kind" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_events" ADD CONSTRAINT "list_events_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_events" ADD CONSTRAINT "list_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_events_list_idx" ON "list_events" USING btree ("list_id","created_at");